import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository, Brackets } from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import {
  installPlatformWatermarkUnderAllContent,
  stampPlatformFooterOnAllPages,
} from '../common/pdf-branding';
import { CreateMeetingMinutesTemplateDto } from './dto/create-meeting-minutes-template.dto';
import { PublishElectionDocumentDto } from './dto/publish-document.dto';
import { CondominiumDocument } from './entities/condominium-document.entity';
import { PlanningPollVote } from './entities/planning-poll-vote.entity';
import { PlanningPoll } from './entities/planning-poll.entity';
import { CondominiumDocumentKind } from './enums/condominium-document-kind.enum';
import { CondominiumDocumentStatus } from './enums/condominium-document-status.enum';
import { AssemblyType } from './enums/assembly-type.enum';
import { GovernanceRole } from './enums/governance-role.enum';
import { PlanningPollStatus } from './enums/planning-poll-status.enum';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { GovernanceService } from './governance.service';
import type { CondoAccess } from './governance.service';
import { CondominiumParticipant } from './entities/condominium-participant.entity';
import { Person } from '../people/person.entity';
import { UsersService } from '../users/users.service';
import { Unit } from '../units/unit.entity';
import {
  extractHtmlSectionByHeading,
  stripPollBodyToPlainText,
} from './poll-body-sanitize';
import {
  allPollOptions,
  buildPollOrdemDiaLines,
  sortedPollQuestions,
} from './poll-questions.util';

@Injectable()
export class PlanningDocumentsService {
  constructor(
    @InjectRepository(CondominiumDocument)
    private readonly docRepo: Repository<CondominiumDocument>,
    @InjectRepository(PlanningPoll)
    private readonly pollRepo: Repository<PlanningPoll>,
    @InjectRepository(PlanningPollVote)
    private readonly voteRepo: Repository<PlanningPollVote>,
    @InjectRepository(CondominiumParticipant)
    private readonly participantRepo: Repository<CondominiumParticipant>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly governance: GovernanceService,
    private readonly usersService: UsersService,
    @Inject(RECEIPT_STORAGE)
    private readonly fileStorage: ReceiptStoragePort,
  ) {}

  /**
   * Vê rascunhos e não publicados: dono, síndico, subsíndico, administrador (papel).
   * Alinhado a `GovernanceService.assertManagement` (menos cidadãos/«member» puro).
   */
  private seesAllPlanningDocuments(access: CondoAccess): boolean {
    return (
      access.kind === 'owner' ||
      (access.kind === 'participant' &&
        (access.role === GovernanceRole.Syndic ||
          access.role === GovernanceRole.SubSyndic ||
          access.role === GovernanceRole.Admin))
    );
  }

  /**
   * Morador: pode descarregar ata (rascunho/definitiva) de pauta já encerrada/decidida
   * sem `visibleToAllResidents`, exceto assembleia de eleição (só após publicação).
   */
  private async residentCanReadUnpublishedAssemblyMinutes(
    condominiumId: string,
    row: CondominiumDocument,
  ): Promise<boolean> {
    if (!row.pollId) {
      return false;
    }
    if (
      row.kind !== CondominiumDocumentKind.AssemblyMinutesDraft &&
      row.kind !== CondominiumDocumentKind.AssemblyMinutesFinal
    ) {
      return false;
    }
    const poll = await this.pollRepo.findOne({
      where: { id: row.pollId, condominiumId },
    });
    if (
      !poll ||
      (poll.status !== PlanningPollStatus.Closed &&
        poll.status !== PlanningPollStatus.Decided)
    ) {
      return false;
    }
    if (poll.assemblyType === AssemblyType.Election) {
      return row.visibleToAllResidents;
    }
    return true;
  }

  async list(condominiumId: string, userId: string) {
    const access = await this.governance.assertAnyAccess(condominiumId, userId);
    if (this.seesAllPlanningDocuments(access)) {
      return this.docRepo.find({
        where: { condominiumId },
        order: { createdAt: 'DESC' },
      });
    }
    const publicDocs = await this.docRepo.find({
      where: { condominiumId, visibleToAllResidents: true },
      order: { createdAt: 'DESC' },
    });
    /** Ata de assembleia ligada a pauta encerrada/decidida: morador pode listar ainda em rascunho (exc. eleições). */
    const whenPollClosed = await this.docRepo
      .createQueryBuilder('d')
      .innerJoin('d.poll', 'p')
      .where('d.condominiumId = :condominiumId', { condominiumId })
      .andWhere('d.pollId IS NOT NULL')
      .andWhere('d.kind IN (:...kinds)', {
        kinds: [
          CondominiumDocumentKind.AssemblyMinutesDraft,
          CondominiumDocumentKind.AssemblyMinutesFinal,
        ],
      })
      .andWhere('p.status IN (:...statuses)', {
        statuses: [PlanningPollStatus.Closed, PlanningPollStatus.Decided],
      })
      .andWhere(
        new Brackets((qb) => {
          qb.where('p.assemblyType != :election', {
            election: AssemblyType.Election,
          }).orWhere('d.visibleToAllResidents = :v', { v: true });
        }),
      )
      .orderBy('d.createdAt', 'DESC')
      .getMany();
    const byId = new Map<string, CondominiumDocument>();
    for (const d of publicDocs) {
      byId.set(d.id, d);
    }
    for (const d of whenPollClosed) {
      if (!byId.has(d.id)) {
        byId.set(d.id, d);
      }
    }
    return Array.from(byId.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async generateMinutesDraft(
    condominiumId: string,
    pollId: string,
    userId: string,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.pollRepo.findOne({
      where: { id: pollId, condominiumId },
      relations: { questions: { options: true }, condominium: true },
    });
    if (!poll) {
      throw new NotFoundException('Pauta não encontrada.');
    }
    const condo = await this.governance.getCondominiumOrThrow(condominiumId);
    const raw = await this.voteRepo
      .createQueryBuilder('v')
      .select('v.optionId', 'optionId')
      .addSelect('COUNT(*)', 'cnt')
      .where('v.pollId = :pollId', { pollId: poll.id })
      .groupBy('v.optionId')
      .getRawMany<{ optionId: string; cnt: string }>();
    const counts: Record<string, number> = {};
    for (const r of raw) {
      counts[r.optionId] = Number(r.cnt);
    }
    const unitsRow = await this.voteRepo
      .createQueryBuilder('v')
      .select('COUNT(DISTINCT v.unitId)', 'cnt')
      .where('v.pollId = :pollId', { pollId: poll.id })
      .getRawOne<{ cnt: string }>();
    const unitsVoted = Number(unitsRow?.cnt ?? 0);

    const attendanceUnitLabels = await this.loadCondominiumUnitAttendanceLabels(
      condominiumId,
    );

    const pdfBuffer = await this.buildPollAssemblyMinutesPdf(
      condo.name,
      condominiumId,
      poll,
      counts,
      unitsVoted,
      attendanceUnitLabels,
    );

    const storageKey = await this.fileStorage.savePlanningDocumentPdf(
      condominiumId,
      pdfBuffer,
    );
    const title = `Ata — ${poll.title}`.slice(0, 500);
    return this.docRepo.save(
      this.docRepo.create({
        id: randomUUID(),
        condominiumId,
        kind: CondominiumDocumentKind.AssemblyMinutesDraft,
        status: CondominiumDocumentStatus.Generated,
        title,
        storageKey,
        mimeType: 'application/pdf',
        pollId: poll.id,
        visibleToAllResidents: false,
        createdByUserId: userId,
        electionPayload: null,
      }),
    );
  }

  async generateMeetingMinutesTemplate(
    condominiumId: string,
    userId: string,
    dto: CreateMeetingMinutesTemplateDto,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const condo = await this.governance.getCondominiumOrThrow(condominiumId);
    const pdfBuffer = await this.buildMeetingMinutesTemplatePdf(
      condo.name,
      dto,
      userId,
    );
    const storageKey = await this.fileStorage.savePlanningDocumentPdf(
      condominiumId,
      pdfBuffer,
    );
    const title = `Ata de reunião — ${dto.title.trim()}`.slice(0, 500);
    return this.docRepo.save(
      this.docRepo.create({
        id: randomUUID(),
        condominiumId,
        kind: CondominiumDocumentKind.MeetingMinutesDraft,
        status: CondominiumDocumentStatus.Generated,
        title,
        storageKey,
        mimeType: 'application/pdf',
        pollId: null,
        visibleToAllResidents: false,
        createdByUserId: userId,
        electionPayload: null,
      }),
    );
  }

  private formatDateTimePtBr(d: Date): string {
    try {
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
    } catch {
      return d.toISOString();
    }
  }

  private formatPollCompetenceDatePtBr(poll: PlanningPoll): string {
    const raw = String(poll.competenceDate ?? '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-');
      return `${d}/${m}/${y}`;
    }
    const c = poll.createdAt;
    const cd = c instanceof Date ? c : new Date(String(c));
    if (Number.isNaN(cd.getTime())) {
      return '—';
    }
    const dd = String(cd.getUTCDate()).padStart(2, '0');
    const mm = String(cd.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(cd.getUTCFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  /**
   * Ex.: "Aos 28 dias do mês de abril de 2026" (data civil da competência da pauta).
   */
  private formatAosDiasDoMesEAnoLine(poll: PlanningPoll): string {
    const monthsPt = [
      'janeiro',
      'fevereiro',
      'março',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro',
    ];
    const raw = String(poll.competenceDate ?? '').trim().slice(0, 10);
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, day] = raw.split('-').map((x) => parseInt(x, 10));
      d = new Date(y, m - 1, day);
    } else {
      const c = poll.createdAt;
      d = c instanceof Date ? c : new Date(String(c));
    }
    if (Number.isNaN(d.getTime())) {
      return 'Aos ___ dias do mês de ___________ de _______';
    }
    const day = d.getDate();
    const monthName = monthsPt[d.getMonth()] ?? '';
    const year = d.getFullYear();
    return `Aos ${day} dias do mês de ${monthName} de ${year}`;
  }

  /** Hora de referência (abertura da pauta), p.ex. "20:00". */
  private formatHoraAberturaPoll(poll: PlanningPoll): string {
    try {
      const t = new Date(poll.opensAt);
      if (Number.isNaN(t.getTime())) {
        return '____:____';
      }
      return t.toLocaleString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Sao_Paulo',
      });
    } catch {
      return '____:____';
    }
  }

  /** Hora de encerramento (data da pauta), p.ex. "21:00". */
  private formatHoraEncerramentoPoll(poll: PlanningPoll): string {
    try {
      const t = new Date(poll.closesAt);
      if (Number.isNaN(t.getTime())) {
        return '____:____';
      }
      return t.toLocaleString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Sao_Paulo',
      });
    } catch {
      return '____:____';
    }
  }

  /**
   * Nome do síndico designado no condomínio (ficha de pessoa), actualizado a cada geração do PDF.
   */
  private async getSyndicDisplayName(
    condominiumId: string,
  ): Promise<string | null> {
    const row = await this.participantRepo.findOne({
      where: { condominiumId, role: GovernanceRole.Syndic },
      order: { createdAt: 'ASC' },
      relations: { person: true },
    });
    if (!row) {
      return null;
    }
    const linked = row.person?.fullName?.trim();
    if (linked) {
      return linked;
    }
    const person = await this.personRepo.findOne({
      where: { userId: row.userId },
      order: { createdAt: 'DESC' },
    });
    return person?.fullName?.trim() ?? null;
  }

  private async loadDraftSigner(userId: string): Promise<{
    signaturePng: Buffer | null;
    displayName: string | null;
  }> {
    const signaturePng =
      (await this.usersService.getUserSignatureBuffer(userId)) ?? null;
    const person = await this.personRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const displayName = person?.fullName?.trim() || null;
    return { signaturePng, displayName };
  }

  /**
   * Frações do condomínio (agrupamento + identificador), para lista de presença no PDF da ata.
   */
  private async loadCondominiumUnitAttendanceLabels(
    condominiumId: string,
  ): Promise<string[]> {
    const raw = await this.unitRepo
      .createQueryBuilder('u')
      .innerJoin('u.grouping', 'g')
      .where('g.condominiumId = :cid', { cid: condominiumId })
      .select('u.identifier', 'identifier')
      .addSelect('g.name', 'groupingName')
      .orderBy('g.name', 'ASC')
      .addOrderBy('u.identifier', 'ASC')
      .getRawMany<{ identifier: string; groupingName: string }>();
    return raw.map((r) => {
      const id = String(r.identifier ?? '').trim() || '—';
      const gn = String(r.groupingName ?? '').trim();
      return gn.length ? `${gn} — ${id}` : id;
    });
  }

  /** Normaliza texto simples para blocos de parágrafo no PDF (`\n\n` entre parágrafos). */
  private normalizePlainTextBlocks(text: string): string {
    return String(text)
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Tabela estilo ata residencial: Nome completo | Unidade | Assinatura (título de secção é
   * desenhado pelo chamador).
   */
  private drawPollAttendanceListTable(
    doc: any,
    margin: number,
    contentWidth: number,
    unitLabels: string[],
    pageBottomReserve: number,
  ): void {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- PDFKit */
    const ink = '#1a1a1a';
    const rowH = 36;
    const wNome = contentWidth * 0.4;
    const wUnit = contentWidth * 0.2;
    const wSig = contentWidth - wNome - wUnit;
    const lineInk = '#111111';
    const maxY = () => doc.page.height - pageBottomReserve;

    const drawTableHeader = (): void => {
      const y0 = doc.y;
      doc.save();
      doc
        .rect(margin, y0, contentWidth, 18)
        .strokeColor(lineInk)
        .lineWidth(0.55)
        .stroke();
      doc
        .moveTo(margin + wNome, y0)
        .lineTo(margin + wNome, y0 + 18)
        .stroke();
      doc
        .moveTo(margin + wNome + wUnit, y0)
        .lineTo(margin + wNome + wUnit, y0 + 18)
        .stroke();
      doc.restore();
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(ink)
        .text('Nome completo', margin + 5, y0 + 5, { width: wNome - 8 });
      doc.text('Unidade', margin + wNome + 4, y0 + 5, {
        width: wUnit - 8,
      });
      doc.text('Assinatura', margin + wNome + wUnit + 4, y0 + 5, {
        width: wSig - 8,
      });
      doc.y = y0 + 20;
      doc.x = margin;
    };

    const ensureRowSpace = (): void => {
      if (doc.y + rowH + 14 > maxY()) {
        doc.addPage();
        doc.x = margin;
        doc.y = margin;
        drawTableHeader();
      }
    };

    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(ink)
      .text(
        'Preenchimento no ato da reunião. A coluna Unidade traz a identificação cadastrada no sistema. Acrescente linhas ou anexo se for necessário.',
        { width: contentWidth, align: 'justify', lineGap: 2.5, paragraphGap: 0 },
      );
    doc.moveDown(0.75);
    if (unitLabels.length === 0) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor('#333333')
        .text('Não há unidades no cadastro; utilize as linhas abaixo ou anexe folha apartada.');
      doc.moveDown(0.45);
    }
    doc.fillColor(ink);
    if (doc.y + 32 + rowH * 2 > maxY()) {
      doc.addPage();
      doc.x = margin;
      doc.y = margin;
    }
    drawTableHeader();
    const labels =
      unitLabels.length > 0
        ? unitLabels
        : Array.from({ length: 8 }, () => ' ');
    for (const label of labels) {
      ensureRowSpace();
      const y0 = doc.y;
      doc.save();
      doc
        .rect(margin, y0, contentWidth, rowH)
        .strokeColor(lineInk)
        .lineWidth(0.4)
        .stroke();
      doc
        .moveTo(margin + wNome, y0)
        .lineTo(margin + wNome, y0 + rowH)
        .stroke();
      doc
        .moveTo(margin + wNome + wUnit, y0)
        .lineTo(margin + wNome + wUnit, y0 + rowH)
        .stroke();
      doc.restore();
      const t = String(label).trim();
      if (t.length) {
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(ink)
          .text(t, margin + wNome + 4, y0 + 8, {
            width: wUnit - 8,
            lineGap: 0.5,
          });
      }
      const lineY = y0 + rowH - 6;
      doc
        .strokeColor('#b0b0b0')
        .lineWidth(0.3)
        .moveTo(margin + 4, lineY)
        .lineTo(margin + wNome - 3, lineY)
        .stroke();
      doc
        .moveTo(margin + wNome + wUnit + 3, lineY)
        .lineTo(margin + contentWidth - 4, lineY)
        .stroke();
      doc.fillColor('#000000');
      doc.y = y0 + rowH;
      doc.x = margin;
    }
    doc.moveDown(0.4);
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Secção final: quem gerou o rascunho (só se existir assinatura digital gravada).
   */
  private drawDraftSignerAndPaperClosing(
    doc: any,
    margin: number,
    contentWidth: number,
    signer: { signaturePng: Buffer | null; displayName: string | null },
  ): void {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- PDFKit */
    if (!signer.signaturePng) {
      return;
    }

    const accent = '#1d4ed8';
    const border = '#e2e8f0';
    const muted = '#64748b';
    const innerPad = 12;

    const drawClosingSectionLabel = (label: string) => {
      doc.moveDown(0.5);
      const y0 = doc.y;
      doc.save();
      doc.rect(margin, y0, 3, 12).fill(accent);
      doc.restore();
      doc.x = margin + 10;
      doc.y = y0;
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(accent)
        .text(label.toUpperCase(), margin + 10, y0, {
          width: contentWidth - 10,
        });
      doc.fillColor('#0f172a');
      doc.x = margin;
      doc.y = y0 + 15;
    };

    drawClosingSectionLabel('Elaboração na plataforma');
    const boxH = 100;
    const boxTop = doc.y;
    doc.save();
    doc.roundedRect(margin, boxTop, contentWidth, boxH, 5).fill('#ffffff');
    doc.strokeColor(border).lineWidth(0.55);
    doc.roundedRect(margin, boxTop, contentWidth, boxH, 5).stroke();
    doc.restore();
    doc.x = margin + innerPad;
    doc.y = boxTop + innerPad;
    doc.font('Helvetica').fontSize(9).fillColor(muted);
    doc.text(
      'Utilizador que gerou este rascunho. A imagem abaixo corresponde à assinatura digital gravada em «Meus dados».',
      { width: contentWidth - innerPad * 2, align: 'left' },
    );
    doc.moveDown(0.35);
    const nameLine =
      signer.displayName?.trim() ||
      '— (indique o nome completo em «Meus dados»)';
    doc.font('Helvetica-Bold').fontSize(10.2).fillColor('#0f172a').text(nameLine);
    doc.moveDown(0.35);
    const imgMaxW = Math.min(210, contentWidth - innerPad * 2);
    const imgMaxH = 46;
    const iy = doc.y;
    try {
      doc.image(signer.signaturePng, margin + innerPad, iy, {
        fit: [imgMaxW, imgMaxH],
      });
      doc.y = iy + imgMaxH + 4;
    } catch {
      doc
        .font('Helvetica-Oblique')
        .fontSize(8.8)
        .fillColor('#94a3b8')
        .text('(Assinatura não pôde ser incorporada ao PDF.)');
    }
    doc.fillColor('#000000');
    doc.x = margin;
    doc.y = boxTop + boxH + 10;

    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Itens numerados para o campo «Ordem do dia» (modelo ata de reunião de condomínio).
   */
  private buildOrdemDiaLines(poll: PlanningPoll): string[] {
    return buildPollOrdemDiaLines(poll);
  }

  /**
   * Ata (rascunho) a partir da pauta, alinhada ao modelo «ata de reunião de condomínio»
   * (texto introdutório, ordem do dia, pauta original, deliberações, encerramento,
   * linhas Síndico/Secretário; lista Nome / Unidade / Assinatura em página apartada).
   */
  private async buildPollAssemblyMinutesPdf(
    condominiumName: string,
    condominiumId: string,
    poll: PlanningPoll,
    counts: Record<string, number>,
    unitsVoted: number,
    attendanceUnitLabels: string[],
  ): Promise<Buffer> {
    const syndicName = (await this.getSyndicDisplayName(condominiumId))?.trim() || null;
    const horaEnc = this.formatHoraEncerramentoPoll(poll);
    const fraseHoraEncerramento =
      horaEnc !== '____:____' && !horaEnc.startsWith('__')
        ? `às ${horaEnc} horas`
        : 'às ______ horas';
    const frasePresidencia = syndicName
      ? `sob a presidência do síndico ${syndicName}.`
      : 'sob a presidência do síndico ________________________________.';
    const nomeLavreiAta = syndicName ?? '_______________________________';
    const textoNadaMais = `Nada mais havendo a tratar, a reunião foi encerrada ${fraseHoraEncerramento}. Eu, ${nomeLavreiAta}, lavrei a presente ata, que após lida e aprovada, segue assinada.`;
    const pautaOriginalPlain = stripPollBodyToPlainText(poll.body);
    const discussionsFromMinutes = extractHtmlSectionByHeading(
      poll.minutesBody,
      /discuss[oõ]es\s+e\s+delibera[cç][oõ]es/i,
    );
    const minutesBodyPlain = stripPollBodyToPlainText(poll.minutesBody);
    const deliberationsPlain =
      discussionsFromMinutes?.trim() ||
      (minutesBodyPlain && minutesBodyPlain !== pautaOriginalPlain
        ? minutesBodyPlain
        : '');

    return new Promise((resolve, reject) => {
      const margin = 62;
      const bottom = 78;
      const doc = new PDFDocument({
        size: 'A4',
        bufferPages: true,
        margins: { top: margin, bottom, left: margin, right: margin },
        info: {
          Title: `Ata — ${poll.title}`.slice(0, 200),
          Author: condominiumName.slice(0, 120),
        },
      });
      installPlatformWatermarkUnderAllContent(doc, { opacity: 0.022 });
      const chunks: Buffer[] = [];
      const pageW = doc.page.width;
      const contentWidth = pageW - margin * 2;
      const ink = '#1a1a1a';
      const headingInk = '#1e293b';
      const muted = '#5c5c5c';
      const accent = '#2563eb';
      const ruleInk = '#e2e8f0';
      const lineTable = '#111111';
      const lineGrid = '#cccccc';
      const bodySize = 11;
      const bodyLineGap = 4;
      const bodyParagraphGap = 11;
      const asDate = (x: Date | string): Date =>
        x instanceof Date ? x : new Date(String(x));
      const maxY = () => doc.page.height - bottom;

      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const voteMode = poll.allowMultiple
        ? 'Escolha múltipla por fração'
        : 'Escolha única por fração';

      const decidedOption =
        poll.decidedOptionId && poll.status === PlanningPollStatus.Decided
          ? allPollOptions(poll).find((o) => o.id === poll.decidedOptionId)
          : null;

      const totalMarks = Object.values(counts).reduce((a, b) => a + b, 0);
      const ordemDia = this.buildOrdemDiaLines(poll);

      const resetX = (): void => {
        doc.x = margin;
      };

      const ensureSpace = (needed: number): void => {
        if (doc.y + needed > maxY()) {
          doc.addPage();
          doc.x = margin;
          doc.y = margin;
        }
      };

      const drawBodyText = (
        text: string,
        opts?: { bold?: boolean; italic?: boolean; justify?: boolean; size?: number },
      ): void => {
        const normalized = this.normalizePlainTextBlocks(text);
        if (!normalized) {
          return;
        }
        resetX();
        const font = opts?.bold
          ? 'Helvetica-Bold'
          : opts?.italic
            ? 'Helvetica-Oblique'
            : 'Helvetica';
        doc
          .font(font)
          .fontSize(opts?.size ?? bodySize)
          .fillColor(ink)
          .text(normalized, {
            width: contentWidth,
            align: opts?.justify === false ? 'left' : 'justify',
            lineGap: bodyLineGap,
            paragraphGap: bodyParagraphGap,
          });
        resetX();
      };

      const drawPlaceholder = (message: string): void => {
        ensureSpace(44);
        doc.moveDown(0.2);
        resetX();
        const boxTop = doc.y;
        const boxPad = 10;
        doc
          .font('Helvetica-Oblique')
          .fontSize(10)
          .fillColor(muted);
        const textH = doc.heightOfString(message, {
          width: contentWidth - boxPad * 2,
          lineGap: 2.5,
        });
        const boxH = textH + boxPad * 2;
        doc.save();
        doc
          .roundedRect(margin, boxTop, contentWidth, boxH, 4)
          .fillAndStroke('#f8fafc', ruleInk);
        doc.restore();
        doc.text(message, margin + boxPad, boxTop + boxPad, {
          width: contentWidth - boxPad * 2,
          align: 'left',
          lineGap: 2.5,
        });
        doc.y = boxTop + boxH + 4;
        doc.fillColor(ink);
        resetX();
      };

      const drawSectionHeading = (title: string): void => {
        ensureSpace(40);
        doc.moveDown(1.1);
        resetX();
        const y0 = doc.y;
        doc.save();
        doc.rect(margin, y0, 3, 15).fill(accent);
        doc.restore();
        doc
          .font('Helvetica-Bold')
          .fontSize(11.2)
          .fillColor(headingInk)
          .text(title, margin + 11, y0 + 1, {
            width: contentWidth - 11,
            align: 'left',
          });
        const ruleY = y0 + 20;
        doc
          .moveTo(margin, ruleY)
          .lineTo(margin + contentWidth, ruleY)
          .strokeColor(ruleInk)
          .lineWidth(0.6)
          .stroke();
        doc.y = ruleY + 12;
        resetX();
      };

      const drawNumberedList = (lines: string[]): void => {
        const numCol = 26;
        for (const line of lines) {
          const match = line.match(/^(\d+)\.\s*(.+)$/s);
          const num = match?.[1] ?? '•';
          const body = (match?.[2] ?? line).trim();
          ensureSpace(28);
          resetX();
          const y0 = doc.y;
          doc
            .font('Helvetica-Bold')
            .fontSize(bodySize)
            .fillColor(headingInk)
            .text(`${num}.`, margin, y0, { width: numCol, align: 'right' });
          doc
            .font('Helvetica')
            .fontSize(bodySize)
            .fillColor(ink)
            .text(body, margin + numCol + 6, y0, {
              width: contentWidth - numCol - 6,
              align: 'justify',
              lineGap: bodyLineGap,
            });
          doc.moveDown(0.75);
          resetX();
        }
      };

      const drawVoteTallyTable = (): void => {
        const rowH = 20;
        const wLabel = contentWidth * 0.78;
        const wVotes = contentWidth - wLabel;
        const options = allPollOptions(poll);

        const drawHeader = (): void => {
          ensureSpace(rowH + 8);
          const y0 = doc.y;
          doc.save();
          doc
            .rect(margin, y0, contentWidth, rowH)
            .fillAndStroke('#f3f4f6', lineTable);
          doc
            .moveTo(margin + wLabel, y0)
            .lineTo(margin + wLabel, y0 + rowH)
            .strokeColor(lineTable)
            .lineWidth(0.45)
            .stroke();
          doc.restore();
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor(ink)
            .text('Opção', margin + 6, y0 + 6, { width: wLabel - 10 });
          doc.text('Votos', margin + wLabel + 4, y0 + 6, {
            width: wVotes - 8,
            align: 'right',
          });
          doc.y = y0 + rowH;
          resetX();
        };

        drawHeader();
        let i = 0;
        for (const o of options) {
          ensureSpace(rowH + 4);
          const y0 = doc.y;
          doc.save();
          doc
            .rect(margin, y0, contentWidth, rowH)
            .strokeColor(lineGrid)
            .lineWidth(0.35)
            .stroke();
          doc
            .moveTo(margin + wLabel, y0)
            .lineTo(margin + wLabel, y0 + rowH)
            .stroke();
          doc.restore();
          doc
            .font('Helvetica')
            .fontSize(9.2)
            .fillColor(ink)
            .text(`${i + 1}. ${o.label}`, margin + 6, y0 + 6, {
              width: wLabel - 10,
              lineGap: 1,
            });
          doc
            .font('Helvetica-Bold')
            .text(String(counts[o.id] ?? 0), margin + wLabel + 4, y0 + 6, {
              width: wVotes - 8,
              align: 'right',
            });
          doc.y = y0 + rowH;
          resetX();
          i += 1;
        }
        doc.moveDown(0.5);
      };

      const drawSignatureField = (
        role: string,
        nameLine?: string | null,
      ): void => {
        ensureSpace(78);
        doc.moveDown(1.1);
        resetX();
        const lineW = contentWidth * 0.62;
        if (nameLine?.trim()) {
          doc
            .font('Helvetica')
            .fontSize(bodySize)
            .fillColor(ink)
            .text(nameLine.trim(), margin, doc.y, {
              width: lineW,
              align: 'left',
              lineGap: bodyLineGap,
            });
          doc.moveDown(0.35);
        }
        const sigLineY = doc.y + 36;
        doc
          .moveTo(margin, sigLineY)
          .lineTo(margin + lineW, sigLineY)
          .strokeColor('#888888')
          .lineWidth(0.55)
          .stroke();
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(muted)
          .text(role, margin, sigLineY + 7, { width: lineW });
        doc.y = sigLineY + 24;
        resetX();
      };

      doc.x = margin;
      doc.y = margin;
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(headingInk)
        .text('ATA DE REUNIÃO DE CONDOMÍNIO', margin, doc.y, {
          width: contentWidth,
          align: 'center',
        });
      doc.moveDown(0.35);
      resetX();
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor(muted)
        .text(poll.title.trim(), {
          width: contentWidth,
          align: 'center',
          lineGap: 2,
        });
      doc.moveDown(0.55);
      resetX();
      const titleRuleY = doc.y;
      doc
        .moveTo(margin + contentWidth * 0.2, titleRuleY)
        .lineTo(margin + contentWidth * 0.8, titleRuleY)
        .strokeColor(ruleInk)
        .lineWidth(0.75)
        .stroke();
      doc.y = titleRuleY + 16;
      resetX();

      drawBodyText(
        `${this.formatAosDiasDoMesEAnoLine(poll)}, às ${this.formatHoraAberturaPoll(poll)} horas, nas dependências do ${condominiumName}, realizou-se reunião de condomínio, ${frasePresidencia}`,
      );
      doc.moveDown(0.55);
      drawBodyText(
        'Estiveram presentes os condôminos conforme a lista de presença apresentada ao final deste documento.',
      );

      drawSectionHeading('ORDEM DO DIA');
      drawNumberedList(ordemDia);

      drawSectionHeading('PAUTA ORIGINAL');
      if (pautaOriginalPlain) {
        drawBodyText(pautaOriginalPlain);
      } else {
        drawPlaceholder('Sem texto de pauta original registado no sistema.');
      }

      drawSectionHeading('DISCUSSÕES E DELIBERAÇÕES');
      if (deliberationsPlain) {
        drawBodyText(deliberationsPlain);
      } else {
        drawPlaceholder(
          'Sem rascunho de ata registado. Utilize o modo reunião para gerar o texto com IA ou preencha manualmente antes de gerar o PDF.',
        );
      }

      if (poll.assemblyType === AssemblyType.Ata) {
        doc.moveDown(0.65);
        drawBodyText(
          'Pauta de registo de assuntos sem votação eletrónica por opções no sistema; consignem-se as deliberações na presente ata e em documentos de suporte, nos termos estatutários.',
        );
      } else {
        drawSectionHeading('APURAÇÃO NO SISTEMA');
        drawBodyText(
          `Modo de voto: ${voteMode}. Unidades com voto: ${unitsVoted}. Total de marcações nas opções: ${totalMarks}. Período de registo: de ${this.formatDateTimePtBr(asDate(poll.opensAt))} a ${this.formatDateTimePtBr(asDate(poll.closesAt))}.`,
        );
        if (decidedOption) {
          doc.moveDown(0.45);
          drawBodyText(`Opção vencedora: «${decidedOption.label}».`, { bold: true });
        }
        doc.moveDown(0.45);
        drawVoteTallyTable();
      }

      drawSectionHeading('ENCERRAMENTO');
      drawBodyText(textoNadaMais);
      drawSignatureField('Síndico', syndicName);
      drawSignatureField('Secretário');

      doc.addPage();
      doc.x = margin;
      doc.y = margin;
      drawSectionHeading('LISTA DE PRESENÇA');
      this.drawPollAttendanceListTable(
        doc,
        margin,
        contentWidth,
        attendanceUnitLabels,
        bottom,
      );

      stampPlatformFooterOnAllPages(doc);
      doc.end();
    });
  }

  private async buildMeetingMinutesTemplatePdf(
    condominiumName: string,
    dto: CreateMeetingMinutesTemplateDto,
    draftAuthorUserId: string,
  ): Promise<Buffer> {
    const title = dto.title.trim();
    const location = dto.location?.trim() ?? '';
    const agenda = dto.agendaNotes?.trim() ?? '';
    let meetingLine = '';
    const rawWhen = dto.meetingAt?.trim();
    if (rawWhen) {
      const d = new Date(rawWhen);
      meetingLine = Number.isNaN(d.getTime())
        ? `Data e hora (referência): ${rawWhen}`
        : `Data e hora: ${this.formatDateTimePtBr(d)}`;
    }

    const signer = await this.loadDraftSigner(draftAuthorUserId);

    return new Promise((resolve, reject) => {
      const margin = 56;
      const doc = new PDFDocument({
        size: 'A4',
        bufferPages: true,
        margins: { top: margin, bottom: 72, left: margin, right: margin },
        info: {
          Title: `Ata de reunião — ${title}`.slice(0, 200),
          Author: condominiumName.slice(0, 120),
        },
      });
      installPlatformWatermarkUnderAllContent(doc, { opacity: 0.028 });
      const chunks: Buffer[] = [];
      const contentWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('Helvetica-Bold').fontSize(13).text('ATA DE REUNIÃO', {
        align: 'center',
      });
      doc.moveDown(0.35);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#333333')
        .text(
          'Modelo padrão para reunião do condomínio (administrativa, de conselho ou assembleia presencial). Preencha as lacunas, retifique se necessário e substitua por via definitiva assinada após a reunião.',
          { align: 'center', width: contentWidth },
        );
      doc.fillColor('#000000');
      doc.moveDown(1.1);

      doc.font('Helvetica-Bold').fontSize(11).text('I — IDENTIFICAÇÃO');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(
        'Fica lavrada a presente ata da reunião abaixo identificada, nos termos da convenção e da legislação aplicável, quando couber.',
        { width: contentWidth, align: 'left' },
      );
      doc.moveDown(0.5);
      doc.text(`Condomínio: ${condominiumName}`, { width: contentWidth });
      doc.text(`Assunto / reunião: ${title}`, { width: contentWidth });
      if (meetingLine) {
        doc.text(meetingLine, { width: contentWidth });
      }
      if (location) {
        doc.text(`Local: ${location}`, { width: contentWidth });
      }
      doc.moveDown(0.85);

      doc.font('Helvetica-Bold').fontSize(11).text('II — ORDEM DO DIA');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10.5);
      if (agenda) {
        doc.text(agenda, { width: contentWidth, align: 'left' });
      } else {
        doc.text(
          '1. _________________________________________________________________',
          { width: contentWidth },
        );
        doc.text(
          '2. _________________________________________________________________',
          { width: contentWidth },
        );
        doc.text(
          '3. _________________________________________________________________',
          { width: contentWidth },
        );
      }
      doc.moveDown(0.85);

      doc.font('Helvetica-Bold').fontSize(11).text('III — PRESENÇA');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(
        'Registre os presentes (síndico, conselho, condôminos ou procuradores, conforme o caso):',
        { width: contentWidth, align: 'left' },
      );
      doc.moveDown(0.45);
      for (let i = 0; i < 8; i++) {
        doc.text('_________________________________________________________________', {
          width: contentWidth,
        });
      }
      doc.moveDown(0.85);

      doc.font('Helvetica-Bold').fontSize(11).text('IV — DELIBERAÇÕES E ORIENTAÇÕES');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(
        'Resumo do que foi tratado e decidido (ou deliberado nos limites da competência da reunião):',
        { width: contentWidth, align: 'left' },
      );
      doc.moveDown(0.5);
      for (let i = 0; i < 12; i++) {
        doc.text('_________________________________________________________________', {
          width: contentWidth,
        });
      }
      doc.moveDown(0.85);

      doc.font('Helvetica-Bold').fontSize(11).text('V — PRÓXIMOS PASSOS (SE HOUVER)');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10.5);
      for (let i = 0; i < 4; i++) {
        doc.text('_________________________________________________________________', {
          width: contentWidth,
        });
      }
      doc.moveDown(0.85);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#444444')
        .text(
          `Documento gerado eletronicamente em ${this.formatDateTimePtBr(new Date())}, para conferência e preenchimento após a reunião.`,
          { width: contentWidth, align: 'left' },
        );
      doc.fillColor('#000000');
      doc.moveDown(0.75);

      this.drawDraftSignerAndPaperClosing(
        doc,
        doc.page.margins.left,
        contentWidth,
        signer,
      );

      stampPlatformFooterOnAllPages(doc);
      doc.end();
    });
  }

  async readFile(condominiumId: string, documentId: string, userId: string) {
    const row = await this.docRepo.findOne({
      where: { id: documentId, condominiumId },
    });
    if (!row || !row.storageKey) {
      throw new NotFoundException('Documento não encontrado.');
    }
    const access = await this.governance.assertAnyAccess(condominiumId, userId);
    if (!this.seesAllPlanningDocuments(access) && !row.visibleToAllResidents) {
      const can = await this.residentCanReadUnpublishedAssemblyMinutes(
        condominiumId,
        row,
      );
      if (!can) {
        throw new BadRequestException('Documento não disponível.');
      }
    }
    return this.fileStorage.readPlanningDocument(
      condominiumId,
      row.storageKey,
    );
  }

  async uploadFinalPdf(
    condominiumId: string,
    documentId: string,
    userId: string,
    buffer: Buffer,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const row = await this.docRepo.findOne({
      where: { id: documentId, condominiumId },
    });
    if (!row) {
      throw new NotFoundException('Documento não encontrado.');
    }
    row.kind =
      row.kind === CondominiumDocumentKind.MeetingMinutesDraft
        ? CondominiumDocumentKind.MeetingMinutesFinal
        : CondominiumDocumentKind.AssemblyMinutesFinal;
    row.status = CondominiumDocumentStatus.PendingUpload;
    const key = await this.fileStorage.savePlanningDocumentPdf(
      condominiumId,
      buffer,
    );
    row.storageKey = key;
    row.mimeType = 'application/pdf';

    const linkedPoll = row.pollId
      ? await this.pollRepo.findOne({
          where: { id: row.pollId, condominiumId },
        })
      : null;
    const isElection =
      linkedPoll?.assemblyType === AssemblyType.Election;
    if (!isElection) {
      row.visibleToAllResidents = true;
      row.status = CondominiumDocumentStatus.Published;
    }

    return this.docRepo.save(row);
  }

  async publish(
    condominiumId: string,
    documentId: string,
    userId: string,
    dto?: PublishElectionDocumentDto,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const row = await this.docRepo.findOne({
      where: { id: documentId, condominiumId },
      relations: { poll: true },
    });
    if (!row) {
      throw new NotFoundException('Documento não encontrado.');
    }
    if (!row.storageKey) {
      throw new BadRequestException('Envie o PDF lavrado antes de publicar.');
    }
    row.visibleToAllResidents = true;
    row.status = CondominiumDocumentStatus.Published;

    const poll = row.pollId
      ? await this.pollRepo.findOne({ where: { id: row.pollId } })
      : null;
    if (poll?.assemblyType === AssemblyType.Election && dto?.syndicUserId) {
      const admins = dto.adminUserIds ?? [];
      row.electionPayload = {
        syndicUserId: dto.syndicUserId,
        adminUserIds: admins,
      };
      await this.applyElectionParticipants(
        condominiumId,
        userId,
        dto.syndicUserId,
        admins,
      );
    }

    return this.docRepo.save(row);
  }

  private async applyElectionParticipants(
    condominiumId: string,
    actorUserId: string,
    syndicUserId: string,
    adminUserIds: string[],
  ) {
    const syndics = await this.participantRepo.find({
      where: { condominiumId, role: GovernanceRole.Syndic },
    });
    for (const s of syndics) {
      await this.participantRepo.remove(s);
    }
    const admins = await this.participantRepo.find({
      where: { condominiumId, role: GovernanceRole.Admin },
    });
    for (const a of admins) {
      await this.participantRepo.remove(a);
    }
    await this.participantRepo.save(
      this.participantRepo.create({
        id: randomUUID(),
        condominiumId,
        userId: syndicUserId,
        personId: null,
        role: GovernanceRole.Syndic,
      }),
    );
    for (const uid of adminUserIds) {
      if (uid === syndicUserId) {
        continue;
      }
      await this.participantRepo.save(
        this.participantRepo.create({
          id: randomUUID(),
          condominiumId,
          userId: uid,
          personId: null,
          role: GovernanceRole.Admin,
        }),
      );
    }
    await this.governance.logElectionApplied(condominiumId, actorUserId, {
      syndicUserId,
      adminUserIds,
    });
  }
}
