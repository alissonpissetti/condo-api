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
import { DocumentStorageHelper } from './document-storage.helper';
import { GovernanceService } from './governance.service';
import { CondominiumParticipant } from './entities/condominium-participant.entity';

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

    const pdfBuffer = await this.buildPdfBuffer(condo.name, poll, counts);

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

  private buildPdfBuffer(
    condominiumName: string,
    poll: PlanningPoll,
    counts: Record<string, number>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(16).text('Ata de assembleia (rascunho)', { underline: true });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`Condomínio: ${condominiumName}`);
      doc.text(`Título da pauta: ${poll.title}`);
      doc.text(
        `Tipo: ${poll.assemblyType === AssemblyType.Election ? 'Eleição' : 'Ordinária'}`,
      );
      doc.text(`Abertura: ${poll.opensAt.toISOString()}`);
      doc.text(`Encerramento: ${poll.closesAt.toISOString()}`);
      if (poll.body) {
        doc.moveDown();
        doc.text('Texto:');
        doc.text(poll.body, { width: 500 });
      }
      doc.moveDown();
      doc.text('Resultado da votação (por opção):');
      for (const o of poll.options ?? []) {
        doc.text(`- ${o.label}: ${counts[o.id] ?? 0} voto(s)`);
      }
      doc.moveDown();
      doc.fontSize(9).text(
        'Documento gerado automaticamente para circulação e reconhecimento dos responsáveis. A versão lavrada deve ser anexada ao sistema.',
        { width: 500 },
      );
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
