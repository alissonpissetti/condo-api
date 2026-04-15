import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { PublishElectionDocumentDto } from './dto/publish-document.dto';
import { CondominiumDocument } from './entities/condominium-document.entity';
import { PlanningPollVote } from './entities/planning-poll-vote.entity';
import { PlanningPoll } from './entities/planning-poll.entity';
import { CondominiumDocumentKind } from './enums/condominium-document-kind.enum';
import { CondominiumDocumentStatus } from './enums/condominium-document-status.enum';
import { AssemblyType } from './enums/assembly-type.enum';
import { GovernanceRole } from './enums/governance-role.enum';
import { PlanningPollStatus } from './enums/planning-poll-status.enum';
import { DocumentStorageHelper } from './document-storage.helper';
import { GovernanceService } from './governance.service';
import { CondominiumParticipant } from './entities/condominium-participant.entity';
import { stripPollBodyToPlainText } from './poll-body-sanitize';

@Injectable()
export class PlanningDocumentsService {
  private readonly storage: DocumentStorageHelper;

  constructor(
    @InjectRepository(CondominiumDocument)
    private readonly docRepo: Repository<CondominiumDocument>,
    @InjectRepository(PlanningPoll)
    private readonly pollRepo: Repository<PlanningPoll>,
    @InjectRepository(PlanningPollVote)
    private readonly voteRepo: Repository<PlanningPollVote>,
    @InjectRepository(CondominiumParticipant)
    private readonly participantRepo: Repository<CondominiumParticipant>,
    private readonly governance: GovernanceService,
    config: ConfigService,
  ) {
    this.storage = new DocumentStorageHelper(config);
  }

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

    const pdfBuffer = await this.buildPdfBuffer(
      condo.name,
      poll,
      counts,
      unitsVoted,
    );

    const storageKey = await this.storage.savePdf(condominiumId, pdfBuffer);
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

  private buildPdfBuffer(
    condominiumName: string,
    poll: PlanningPoll,
    counts: Record<string, number>,
    unitsVoted: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 56,
        size: 'A4',
        info: {
          Title: `Ata — ${poll.title}`.slice(0, 200),
          Author: condominiumName.slice(0, 120),
        },
      });
      const chunks: Buffer[] = [];
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const assemblyKind =
        poll.assemblyType === AssemblyType.Election
          ? 'Assembleia Geral para fins eleitorais'
          : 'Assembleia Geral Ordinária (ou extraordinária, conforme convocação)';

      const voteMode = poll.allowMultiple
        ? 'Escolha múltipla por unidade (várias opções podem ser assinaladas por fração)'
        : 'Escolha única por unidade (uma opção por fração)';

      const decidedOption =
        poll.decidedOptionId && poll.status === PlanningPollStatus.Decided
          ? poll.options?.find((o) => o.id === poll.decidedOptionId)
          : null;

      const totalMarks = Object.values(counts).reduce((a, b) => a + b, 0);

      doc.font('Helvetica-Bold').fontSize(13).text('ATA DE ASSEMBLEIA', {
        align: 'center',
      });
      doc.moveDown(0.35);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#333333')
        .text(
          'Rascunho para conferência, retificação e assinaturas. A versão definitiva, quando lavrada e publicada, constitui o registro formal da deliberação.',
          { align: 'center', width: contentWidth },
        );
      doc.fillColor('#000000');
      doc.moveDown(1.2);

      doc.font('Helvetica-Bold').fontSize(11).text('I — IDENTIFICAÇÃO');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(
        `Fica lavrada a presente ata referente à deliberação da seguinte matéria no âmbito do condomínio identificado, nos termos da legislação aplicável e da convenção do condomínio, quando houver.`,
        { width: contentWidth, align: 'justify' },
      );
      doc.moveDown(0.5);
      doc.text(`Condomínio: ${condominiumName}`, { width: contentWidth });
      doc.text(`Natureza da assembleia: ${assemblyKind}`, { width: contentWidth });
      doc.text(`Identificação da pauta / matéria: ${poll.title}`, {
        width: contentWidth,
      });
      doc.text(
        `Período convocado para votação (referência): de ${this.formatDateTimePtBr(poll.opensAt)} a ${this.formatDateTimePtBr(poll.closesAt)}.`,
        { width: contentWidth, align: 'justify' },
      );
      doc.moveDown(0.85);

      doc.font('Helvetica-Bold').fontSize(11).text('II — DA MATÉRIA EM DELIBERAÇÃO');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(
        'Objeto: apreciação e deliberação da matéria constante do título desta ata, conforme opções de voto abaixo relacionadas.',
        { width: contentWidth, align: 'justify' },
      );
      doc.moveDown(0.45);
      if (poll.body) {
        const plain = stripPollBodyToPlainText(poll.body);
        if (plain) {
          doc.font('Helvetica-Bold').text('Ementa / fundamentação (resumo):');
          doc.moveDown(0.25);
          doc.font('Helvetica').text(plain, {
            width: contentWidth,
            align: 'justify',
          });
          doc.moveDown(0.5);
        }
      }

      doc.font('Helvetica-Bold').fontSize(11).text('III — DO PROCESSO DE VOTAÇÃO');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(
        `A votação foi realizada por unidade autônoma (fração), no modo: ${voteMode}. Cada unidade possui, no máximo, um registro de voto vigente; eventual novo registro substitui o anterior.`,
        { width: contentWidth, align: 'justify' },
      );
      doc.moveDown(0.85);

      doc.font('Helvetica-Bold').fontSize(11).text('IV — DA APURAÇÃO');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(
        `Participaram da votação, nesta apuração, ${unitsVoted} unidade(s) distinta(s), perfazendo ${totalMarks} marcação(ões) nas opções, conforme quadro resumo:`,
        { width: contentWidth, align: 'justify' },
      );
      doc.moveDown(0.45);
      let n = 1;
      for (const o of [...(poll.options ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      )) {
        const c = counts[o.id] ?? 0;
        doc.text(`${n}. ${o.label} — ${c} voto(s) / marcação(ões).`, {
          width: contentWidth,
        });
        n += 1;
      }
      doc.moveDown(0.85);

      doc.font('Helvetica-Bold').fontSize(11).text('V — DA DELIBERAÇÃO');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10.5);
      if (decidedOption) {
        doc.text(
          'Ante o resultado do escrutínio e nos termos legais e convencionais aplicáveis, a assembleia, por meio dos votos registrados e da formalização abaixo, DELIBERA o seguinte:',
          { width: contentWidth, align: 'justify' },
        );
        doc.moveDown(0.5);
        doc
          .font('Helvetica-Bold')
          .text(`« ${decidedOption.label} »`, {
            width: contentWidth,
            align: 'justify',
          });
        doc.moveDown(0.5);
        doc.font('Helvetica').text(
          'A deliberação acima corresponde à opção assim consignada pelo órgão competente para registro da decisão nesta pauta, devendo a presente ata ser juntada aos livros e registros do condomínio, na forma da lei.',
          { width: contentWidth, align: 'justify' },
        );
      } else {
        doc.text(
          'A deliberação final será consignada na versão definitiva desta ata, após encerramento do processo de votação, eventual homologação e escolha da opção vencedora nos termos estatutários e legais. Enquanto não formalizada, o quadro da Seção IV subsiste apenas como resumo do escrutínio.',
          { width: contentWidth, align: 'justify' },
        );
      }
      doc.moveDown(1);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#444444')
        .text(
          `Documento gerado eletronicamente em ${this.formatDateTimePtBr(new Date())}, para fins de rascunho. Substitui-se por via definitiva assinada pelos responsáveis.`,
          { width: contentWidth, align: 'justify' },
        );
      doc.fillColor('#000000');
      doc.moveDown(1.2);

      doc.font('Helvetica-Bold').fontSize(10).text('Assinaturas (preencher na via definitiva)');
      doc.moveDown(0.75);
      doc.font('Helvetica').fontSize(10);
      doc.text('______________________________________________');
      doc.text('Presidente da assembleia');
      doc.text('Nome completo: _________________________________');
      doc.text('CPF: ___________________________________________');
      doc.moveDown(0.9);
      doc.text('______________________________________________');
      doc.text('Secretário(a) da assembleia');
      doc.text('Nome completo: _________________________________');
      doc.text('CPF: ___________________________________________');
      doc.moveDown(0.9);
      doc.text('Local e data: __________________________________');

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
    return this.storage.readFile(condominiumId, row.storageKey);
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
    row.kind = CondominiumDocumentKind.AssemblyMinutesFinal;
    row.status = CondominiumDocumentStatus.PendingUpload;
    const key = await this.storage.savePdf(condominiumId, buffer);
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
