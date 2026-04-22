import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
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
import { CondominiumParticipant } from './entities/condominium-participant.entity';
import { Person } from '../people/person.entity';
import { UsersService } from '../users/users.service';
import { stripPollBodyToPlainText } from './poll-body-sanitize';

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
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly governance: GovernanceService,
    private readonly usersService: UsersService,
    @Inject(RECEIPT_STORAGE)
    private readonly fileStorage: ReceiptStoragePort,
  ) {}

  async list(condominiumId: string, userId: string) {
    const access = await this.governance.assertAnyAccess(condominiumId, userId);
    const isMgmt =
      access.kind === 'owner' ||
      (access.kind === 'participant' &&
        (access.role === GovernanceRole.Syndic ||
          access.role === GovernanceRole.Admin));
    if (isMgmt) {
      return this.docRepo.find({
        where: { condominiumId },
        order: { createdAt: 'DESC' },
      });
    }
    return this.docRepo.find({
      where: { condominiumId, visibleToAllResidents: true },
      order: { createdAt: 'DESC' },
    });
  }

  async generateMinutesDraft(
    condominiumId: string,
    pollId: string,
    userId: string,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.pollRepo.findOne({
      where: { id: pollId, condominiumId },
      relations: { options: true, condominium: true },
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

    const pdfBuffer = await this.buildPollAssemblyMinutesPdf(
      condo.name,
      condominiumId,
      poll,
      counts,
      unitsVoted,
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

  private async participantDisplayName(
    row: CondominiumParticipant,
  ): Promise<string | null> {
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

  /** Síndico e subsíndico registados na gestão do condomínio (para assinaturas no PDF da ata). */
  private async resolveCondominiumMgmtSigners(condominiumId: string): Promise<{
    syndic: { displayName: string | null; signaturePng: Buffer | null } | null;
    subSyndic: { displayName: string | null; signaturePng: Buffer | null } | null;
  }> {
    const syndRow = await this.participantRepo.findOne({
      where: { condominiumId, role: GovernanceRole.Syndic },
      order: { createdAt: 'ASC' },
      relations: { person: true },
    });
    const subRow = await this.participantRepo.findOne({
      where: { condominiumId, role: GovernanceRole.SubSyndic },
      order: { createdAt: 'ASC' },
      relations: { person: true },
    });
    let syndic: {
      displayName: string | null;
      signaturePng: Buffer | null;
    } | null = null;
    if (syndRow) {
      syndic = {
        displayName: await this.participantDisplayName(syndRow),
        signaturePng: await this.usersService.getUserSignatureBuffer(
          syndRow.userId,
        ),
      };
    }
    let subSyndic: {
      displayName: string | null;
      signaturePng: Buffer | null;
    } | null = null;
    if (subRow) {
      subSyndic = {
        displayName: await this.participantDisplayName(subRow),
        signaturePng: await this.usersService.getUserSignatureBuffer(
          subRow.userId,
        ),
      };
    }
    return { syndic, subSyndic };
  }

  /**
   * Bloco de assinatura (síndico / subsíndico). Só deve ser chamado quando `signaturePng` existe.
   * `boxTop` em coordenadas absolutas; devolve a coordenada Y imediatamente abaixo do bloco.
   */
  private drawPdfMgmtRoleSignatureBlock(
    doc: any,
    boxLeft: number,
    boxTop: number,
    boxWidth: number,
    roleTitle: string,
    displayName: string | null,
    signaturePng: Buffer,
  ): number {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- PDFKit */
    const innerPad = 11;
    const border = '#e2e8f0';
    const accent = '#0f172a';
    const boxH = 82;
    doc.save();
    doc.roundedRect(boxLeft, boxTop, boxWidth, boxH, 4).fill('#ffffff');
    doc.strokeColor(border).lineWidth(0.45);
    doc.roundedRect(boxLeft, boxTop, boxWidth, boxH, 4).stroke();
    doc.restore();
    doc.x = boxLeft + innerPad;
    doc.y = boxTop + innerPad;
    doc.font('Helvetica-Bold').fontSize(8.8).fillColor(accent).text(roleTitle, {
      characterSpacing: 0.25,
    });
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(9.1).fillColor('#1e293b');
    doc.text(
      displayName?.trim() || '— (nome não encontrado na ficha de pessoa)',
      { width: boxWidth - innerPad * 2, lineGap: 1.2, characterSpacing: 0 },
    );
    doc.moveDown(0.32);
    const imgMaxW = Math.min(168, boxWidth - innerPad * 2);
    const imgMaxH = 40;
    const iy = doc.y;
    try {
      doc.image(signaturePng, boxLeft + innerPad, iy, {
        fit: [imgMaxW, imgMaxH],
      });
      doc.y = iy + imgMaxH + 3;
    } catch {
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor('#94a3b8')
        .text('(Imagem da assinatura indisponível.)');
    }
    doc.fillColor('#000000');
    return boxTop + boxH + 8;
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Ata (pauta): assinaturas digitais do síndico e do subsíndico — só aparecem responsáveis com assinatura gravada em «Meus dados».
   */
  private drawCondominiumMgmtSignaturesAndPaperClosing(
    doc: any,
    margin: number,
    contentWidth: number,
    mgmt: {
      syndic: { displayName: string | null; signaturePng: Buffer | null } | null;
      subSyndic: { displayName: string | null; signaturePng: Buffer | null } | null;
    },
  ): void {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- PDFKit */
    const bar = '#334155';
    const ink = '#0f172a';
    const muted = '#64748b';
    const hasSyndic = !!mgmt.syndic;
    const hasSubSyndic = !!mgmt.subSyndic;
    const showSyndic = hasSyndic && !!mgmt.syndic!.signaturePng;
    const showSubSyndic = hasSubSyndic && !!mgmt.subSyndic!.signaturePng;

    doc.moveDown(0.55);
    const y0 = doc.y;
    doc.save();
    doc.rect(margin, y0, 2.5, 12).fill(bar);
    doc.restore();
    doc.x = margin + 9;
    doc.y = y0;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(ink)
      .text('Assinaturas digitais da gestão', margin + 9, y0, {
        width: contentWidth - 9,
      });
    doc.fillColor(ink);
    doc.x = margin;
    doc.y = y0 + 15;
    doc.font('Helvetica').fontSize(9).fillColor(muted);
    doc.text(
      'Só constam abaixo os responsáveis com assinatura digital gravada em «Meus dados». Cada pedido de PDF gera um ficheiro novo com os dados actuais.',
      { width: contentWidth, align: 'justify', lineGap: 1.4 },
    );
    doc.moveDown(0.55);
    doc.fillColor('#000000');

    if (!hasSyndic) {
      doc.font('Helvetica').fontSize(9.1).fillColor('#94a3b8').text(
        'Não existe síndico designado para este condomínio na plataforma.',
        { width: contentWidth, align: 'left' },
      );
      doc.moveDown(0.55);
    }

    if (showSyndic && showSubSyndic) {
      const gap = 12;
      const colW = (contentWidth - gap) / 2;
      const rowTop = doc.y;
      const bottomL = this.drawPdfMgmtRoleSignatureBlock(
        doc,
        margin,
        rowTop,
        colW,
        'Síndico(a)',
        mgmt.syndic!.displayName,
        mgmt.syndic!.signaturePng!,
      );
      const bottomR = this.drawPdfMgmtRoleSignatureBlock(
        doc,
        margin + colW + gap,
        rowTop,
        colW,
        'Subsíndico(a)',
        mgmt.subSyndic!.displayName,
        mgmt.subSyndic!.signaturePng!,
      );
      doc.y = Math.max(bottomL, bottomR);
      doc.x = margin;
    } else if (showSyndic) {
      doc.y = this.drawPdfMgmtRoleSignatureBlock(
        doc,
        margin,
        doc.y,
        contentWidth,
        'Síndico(a)',
        mgmt.syndic!.displayName,
        mgmt.syndic!.signaturePng!,
      );
    } else if (showSubSyndic) {
      doc.y = this.drawPdfMgmtRoleSignatureBlock(
        doc,
        margin,
        doc.y,
        contentWidth,
        'Subsíndico(a)',
        mgmt.subSyndic!.displayName,
        mgmt.subSyndic!.signaturePng!,
      );
    }

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
      { width: contentWidth - innerPad * 2, align: 'justify' },
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
   * Ata em PDF (rascunho) gerada a partir de uma pauta: layout claro, quadro de identificação,
   * apuração em tabela e destaque da decisão; assinaturas digitais do síndico e subsíndico.
   */
  private async buildPollAssemblyMinutesPdf(
    condominiumName: string,
    condominiumId: string,
    poll: PlanningPoll,
    counts: Record<string, number>,
    unitsVoted: number,
  ): Promise<Buffer> {
    const mgmtSigners = await this.resolveCondominiumMgmtSigners(condominiumId);
    return new Promise((resolve, reject) => {
      const margin = 52;
      const bottom = 70;
      const doc = new PDFDocument({
        size: 'A4',
        bufferPages: true,
        margins: { top: margin, bottom, left: margin, right: margin },
        info: {
          Title: `Ata — ${poll.title}`.slice(0, 200),
          Author: condominiumName.slice(0, 120),
        },
      });
      installPlatformWatermarkUnderAllContent(doc, { opacity: 0.01 });
      const chunks: Buffer[] = [];
      const pageW = doc.page.width;
      const contentWidth = pageW - margin * 2;
      const ink = '#0f172a';
      const muted = '#64748b';
      const line = '#e2e8f0';
      const lineStrong = '#cbd5e1';
      const sectionBar = '#334155';
      const cardBg = '#f8fafc';
      const metaKeyBg = '#f1f5f9';
      const asDate = (x: Date | string): Date =>
        x instanceof Date ? x : new Date(String(x));

      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const assemblyKind =
        poll.assemblyType === AssemblyType.Election
          ? 'Assembleia geral — fins eleitorais'
          : poll.assemblyType === AssemblyType.Ata
            ? 'Registro de assembleia / reunião (sem votação por opções no sistema)'
            : 'Assembleia geral ordinária ou extraordinária (conforme convocação)';

      const voteMode = poll.allowMultiple
        ? 'Escolha múltipla por fração'
        : 'Escolha única por fração';

      const decidedOption =
        poll.decidedOptionId && poll.status === PlanningPollStatus.Decided
          ? poll.options?.find((o) => o.id === poll.decidedOptionId)
          : null;

      const totalMarks = Object.values(counts).reduce((a, b) => a + b, 0);

      const drawSectionLabel = (label: string) => {
        doc.moveDown(0.85);
        const y0 = doc.y;
        doc.save();
        doc.rect(margin, y0, 2.4, 14).fill(sectionBar);
        doc.restore();
        const textLeft = margin + 10;
        doc
          .font('Helvetica-Bold')
          .fontSize(11.3)
          .fillColor(ink)
          .text(label, textLeft, y0, { width: contentWidth - 10 });
        const yRule = doc.y + 4;
        doc
          .moveTo(textLeft, yRule)
          .lineTo(margin + contentWidth, yRule)
          .strokeColor(lineStrong)
          .lineWidth(0.4)
          .stroke();
        doc.y = yRule + 11;
        doc.x = margin;
      };

      const drawMetaTable = (rows: { k: string; v: string }[]) => {
        const keyW = 122;
        const pad = 10;
        let y = doc.y;
        let ri = 0;
        for (const { k, v } of rows) {
          doc.font('Helvetica').fontSize(9.1);
          const rowH =
            Math.max(
              38,
              doc.heightOfString(v, { width: contentWidth - keyW - 16 }) +
                pad * 2,
            ) + 2;
          const rowTint = ri % 2 === 0 ? '#ffffff' : '#fafbfc';
          doc.save();
          doc.rect(margin + keyW, y, contentWidth - keyW, rowH).fill(rowTint);
          doc.rect(margin, y, keyW, rowH).fill(metaKeyBg);
          doc
            .rect(margin, y, contentWidth, rowH)
            .strokeColor(line)
            .lineWidth(0.35)
            .stroke();
          doc.moveTo(margin + keyW, y).lineTo(margin + keyW, y + rowH).stroke();
          doc.restore();
          doc.font('Helvetica-Bold').fontSize(8.7).fillColor('#475569').text(k, margin + 8, y + pad, {
            width: keyW - 14,
            lineGap: 0.5,
            characterSpacing: 0,
          });
          doc.font('Helvetica').fontSize(9.1).fillColor(ink).text(v, margin + keyW + 8, y + pad, {
            width: contentWidth - keyW - 16,
            align: 'left',
            lineGap: 1,
            characterSpacing: 0,
          });
          y += rowH;
          ri += 1;
        }
        doc.y = y + 10;
        doc.x = margin;
      };

      doc.x = margin;
      doc.y = margin;
      doc
        .moveTo(margin, doc.y)
        .lineTo(margin + contentWidth, doc.y)
        .strokeColor(sectionBar)
        .lineWidth(1.1)
        .stroke();
      doc.moveDown(0.55);
      const headerCardH = 64;
      const yCard = doc.y;
      doc.save();
      doc.roundedRect(margin, yCard, contentWidth, headerCardH, 5).fill(cardBg);
      doc.strokeColor(line).lineWidth(0.5);
      doc.roundedRect(margin, yCard, contentWidth, headerCardH, 5).stroke();
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(18.5).fillColor(ink).text('Ata da deliberação', margin, yCard + 14, {
        width: contentWidth,
        align: 'center',
      });
      doc.font('Helvetica').fontSize(9).fillColor(muted).text(
        'Rascunho eletrónico para conferência. Substituir por via definitiva quando aplicável.',
        margin,
        yCard + 40,
        { width: contentWidth, align: 'center', lineGap: 1.2 },
      );
      doc.y = yCard + headerCardH + 16;
      doc.x = margin;

      doc.font('Helvetica-Bold').fontSize(8.3).fillColor('#475569').text('Identificação', {
        width: contentWidth,
        characterSpacing: 0.4,
      });
      doc.moveDown(0.35);

      drawMetaTable([
        { k: 'Condomínio', v: condominiumName },
        { k: 'Natureza', v: assemblyKind },
        { k: 'Matéria', v: poll.title },
        {
          k: 'Competência (data civil)',
          v: this.formatPollCompetenceDatePtBr(poll),
        },
        {
          k: 'Período (ref.)',
          v: `de ${this.formatDateTimePtBr(asDate(poll.opensAt))} a ${this.formatDateTimePtBr(asDate(poll.closesAt))}`,
        },
        { k: 'Ref. pauta', v: poll.id },
      ]);

      drawSectionLabel('Matéria em deliberação');
      doc.font('Helvetica').fontSize(10.4).fillColor(ink);
      doc.text(
        poll.assemblyType === AssemblyType.Ata
          ? 'Objeto: registro da matéria indicada no título, com suporte na descrição, anexos e documentação de convocação, quando existirem.'
          : 'Objeto: apreciação e deliberação da matéria identificada no título, mediante as opções de voto registradas no sistema.',
        { width: contentWidth, align: 'justify', lineGap: 2 },
      );
      doc.fillColor('#000000');
      if (poll.body) {
        const plain = stripPollBodyToPlainText(poll.body);
        if (plain) {
          doc.moveDown(0.45);
          doc.font('Helvetica-Bold').fontSize(10).text('Resumo / fundamentação');
          doc.moveDown(0.25);
          doc.font('Helvetica').fontSize(10).text(plain, {
            width: contentWidth,
            align: 'justify',
            lineGap: 2,
          });
        }
      }

      drawSectionLabel('Processo de votação');
      doc.font('Helvetica').fontSize(10.35);
      if (poll.assemblyType === AssemblyType.Ata) {
        doc.text(
          'Pauta do tipo «Ata»: não houve votação por opções no sistema. Consigne deliberações na descrição, anexos e na versão final da ata.',
          { width: contentWidth, align: 'justify', lineGap: 2 },
        );
      } else {
        doc.text(
          `Modo de escrutínio: ${voteMode}. Cada fração possui, no máximo, um registro de voto vigente; novo registro substitui o anterior.`,
          { width: contentWidth, align: 'justify', lineGap: 2 },
        );
      }

      drawSectionLabel('Apuração');
      if (poll.assemblyType === AssemblyType.Ata) {
        doc.font('Helvetica').fontSize(10.3).text(
          'Não aplicável: sem opções de voto no sistema.',
          { width: contentWidth, align: 'justify', lineGap: 2 },
        );
      } else {
        doc
          .font('Helvetica')
          .fontSize(10.2)
          .text(
            `Unidades com voto: ${unitsVoted}. Total de marcações nas opções: ${totalMarks}.`,
            { width: contentWidth, align: 'justify', lineGap: 2 },
          );
        doc.moveDown(0.55);
        const colLabel = margin + 10;
        const colVotes = margin + contentWidth * 0.68;
        const rowH = 18;
        const tableTop = doc.y;
        let y = tableTop;
        doc.save();
        doc.rect(margin, y, contentWidth, rowH).fill('#f1f5f9');
        doc.strokeColor(lineStrong).lineWidth(0.4);
        doc.moveTo(margin, y + rowH).lineTo(margin + contentWidth, y + rowH).stroke();
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155');
        doc.text('Opção', colLabel, y + 6, { width: colVotes - colLabel - 8 });
        doc.text('Votos', colVotes, y + 6, {
          width: margin + contentWidth - colVotes - 10,
          align: 'right',
        });
        doc.y = y + rowH;
        let i = 0;
        for (const o of [...(poll.options ?? [])].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        )) {
          const c = counts[o.id] ?? 0;
          y = doc.y;
          const stripe = i % 2 === 0 ? '#ffffff' : '#fafbfc';
          doc.save();
          doc.rect(margin, y, contentWidth, rowH).fill(stripe);
          doc.strokeColor(line).lineWidth(0.35);
          doc.moveTo(margin, y + rowH).lineTo(margin + contentWidth, y + rowH).stroke();
          doc.restore();
          doc.font('Helvetica').fontSize(9.65).fillColor(ink);
          doc.text(`${i + 1}. ${o.label}`, colLabel, y + 5, {
            width: colVotes - colLabel - 10,
          });
          doc.font('Helvetica-Bold').fontSize(9.65).fillColor(sectionBar).text(String(c), colVotes, y + 5, {
            width: margin + contentWidth - colVotes - 10,
            align: 'right',
          });
          doc.y = y + rowH;
          i += 1;
        }
        const tableBottom = doc.y;
        doc.save();
        doc.roundedRect(margin, tableTop, contentWidth, tableBottom - tableTop, 4).strokeColor(lineStrong).lineWidth(0.55).stroke();
        doc.restore();
        doc.moveDown(0.45);
      }

      drawSectionLabel('Deliberação');
      if (decidedOption) {
        const par =
          'Ante o escrutínio e nos termos aplicáveis, a assembleia delibera e consagra a seguinte opção como decisão desta pauta:';
        const optQuoted = `« ${decidedOption.label} »`;
        const foot =
          'A decisão deve ser juntada aos livros e registros do condomínio, na forma da lei e da convenção.';

        doc.x = margin;
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(ink)
          .text('Decisão registrada', { width: contentWidth });
        doc.moveDown(0.35);
        doc.font('Helvetica').fontSize(10.15).fillColor(ink);
        doc.text(par, { width: contentWidth, align: 'justify', lineGap: 1.8 });
        doc.moveDown(0.45);
        doc.font('Helvetica-Bold').fontSize(11.2).fillColor(sectionBar);
        doc.text(optQuoted, { width: contentWidth, align: 'left' });
        doc.moveDown(0.45);
        doc.font('Helvetica').fontSize(9.85).fillColor(ink);
        doc.text(foot, { width: contentWidth, align: 'justify', lineGap: 1.6 });
        doc.fillColor('#000000');
        doc.x = margin;
      } else if (poll.assemblyType === AssemblyType.Ata) {
        doc.font('Helvetica').fontSize(10.3).text(
          'As deliberações devem constar da ata lavrada após a reunião e dos documentos de suporte arquivados.',
          { width: contentWidth, align: 'justify', lineGap: 2 },
        );
      } else {
        doc.font('Helvetica').fontSize(10.3).text(
          'Enquanto não for escolhida e registrada a opção vencedora nos termos estatutários, o quadro da apuração subsiste apenas como resumo do escrutínio.',
          { width: contentWidth, align: 'justify', lineGap: 2 },
        );
      }

      doc.moveDown(0.9);
      doc.font('Helvetica-Oblique').fontSize(8.4).fillColor(muted).text(
        `Gerado eletronicamente em ${this.formatDateTimePtBr(new Date())}. Não substitui a via definitiva nem exigências legais de forma autónoma.`,
        { width: contentWidth, align: 'justify', lineGap: 1.2 },
      );
      doc.fillColor('#000000');
      doc.moveDown(0.6);

      this.drawCondominiumMgmtSignaturesAndPaperClosing(
        doc,
        margin,
        contentWidth,
        mgmtSigners,
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
        { width: contentWidth, align: 'justify' },
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
        doc.text(agenda, { width: contentWidth, align: 'justify' });
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
        { width: contentWidth, align: 'justify' },
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
        { width: contentWidth, align: 'justify' },
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
          { width: contentWidth, align: 'justify' },
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
    const isMgmt =
      access.kind === 'owner' ||
      (access.kind === 'participant' &&
        (access.role === GovernanceRole.Syndic ||
          access.role === GovernanceRole.Admin));
    if (!isMgmt && !row.visibleToAllResidents) {
      throw new BadRequestException('Documento não disponível.');
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
