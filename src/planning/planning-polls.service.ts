import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import { In, Repository } from 'typeorm';
import { Grouping } from '../groupings/grouping.entity';
import { Person } from '../people/person.entity';
import { Unit } from '../units/unit.entity';
import { resolveUnitFinancialResponsibleDisplayName } from '../units/unit-financial-responsible.util';
import { CastVoteDto } from './dto/cast-vote.dto';
import {
  PollFinalResolutionOutcome,
  RegisterPollFinalResolutionDto,
} from './dto/register-poll-final-resolution.dto';
import { CreatePlanningPollDto } from './dto/create-planning-poll.dto';
import { ListPlanningPollsQueryDto } from './dto/list-planning-polls.query.dto';
import { UpdatePlanningPollDto } from './dto/update-planning-poll.dto';
import { PlanningPollAttachment } from './entities/planning-poll-attachment.entity';
import { PlanningPollOption } from './entities/planning-poll-option.entity';
import { PlanningPollQuestion } from './entities/planning-poll-question.entity';
import { PlanningPollVote } from './entities/planning-poll-vote.entity';
import { PlanningPoll } from './entities/planning-poll.entity';
import { AssemblyType } from './enums/assembly-type.enum';
import { GovernanceRole } from './enums/governance-role.enum';
import { PlanningPollStatus } from './enums/planning-poll-status.enum';
import { GovernanceService } from './governance.service';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { sanitizePollBodyRich } from './poll-body-sanitize';
import {
  normalizeMulterOriginalName,
  repairMojibakeUtf8Filename,
} from './upload-filename-encoding.util';
import {
  allPollOptions,
  allQuestionsDecided,
  buildQuestionEntities,
  pollHasVoting,
  resolveQuestionInputsFromCreate,
  resolveQuestionInputsFromUpdate,
  sortedPollQuestions,
} from './poll-questions.util';

export type VotableUnitRow = {
  id: string;
  identifier: string;
  responsibleName: string | null;
};

@Injectable()
export class PlanningPollsService {
  constructor(
    @InjectRepository(PlanningPoll)
    private readonly pollRepo: Repository<PlanningPoll>,
    @InjectRepository(PlanningPollOption)
    private readonly optionRepo: Repository<PlanningPollOption>,
    @InjectRepository(PlanningPollQuestion)
    private readonly questionRepo: Repository<PlanningPollQuestion>,
    @InjectRepository(PlanningPollVote)
    private readonly voteRepo: Repository<PlanningPollVote>,
    @InjectRepository(PlanningPollAttachment)
    private readonly attachmentRepo: Repository<PlanningPollAttachment>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly governance: GovernanceService,
    @Inject(RECEIPT_STORAGE)
    private readonly attachmentStorage: ReceiptStoragePort,
  ) {}

  private normalizeCompetenceYmdOrThrow(raw: string): string {
    const s = raw.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      throw new BadRequestException(
        'Data de competência inválida; use o formato AAAA-MM-DD.',
      );
    }
    return s;
  }

  private normalizePollRelations(poll: PlanningPoll): void {
    sortedPollQuestions(poll);
    if (poll.attachments?.length) {
      poll.attachments.sort((a, b) => a.sortOrder - b.sortOrder);
      for (const a of poll.attachments) {
        a.originalFilename = repairMojibakeUtf8Filename(a.originalFilename);
      }
    }
  }

  private async loadPollForCondo(condominiumId: string, pollId: string) {
    const poll = await this.pollRepo.findOne({
      where: { id: pollId, condominiumId },
      relations: { questions: { options: true }, attachments: true },
    });
    if (!poll) {
      throw new NotFoundException('Pauta não encontrada.');
    }
    this.normalizePollRelations(poll);
    return poll;
  }

  private defaultRegisteredRangeUtc(): { from: Date; to: Date } {
    const now = new Date();
    const toYmd = now.toISOString().slice(0, 10);
    const to = new Date(`${toYmd}T23:59:59.999Z`);
    const from = new Date(`${toYmd}T00:00:00.000Z`);
    from.setUTCDate(from.getUTCDate() - 29);
    return { from, to };
  }

  private parseUtcDayStart(ymd: string): Date {
    return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
  }

  private parseUtcDayEnd(ymd: string): Date {
    return new Date(`${ymd.slice(0, 10)}T23:59:59.999Z`);
  }

  async list(
    condominiumId: string,
    userId: string,
    query: ListPlanningPollsQueryDto = {},
  ) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const includeArchived = query.includeArchived === true;
    if (includeArchived) {
      await this.governance.assertSyndicOrOwner(condominiumId, userId);
    }
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 100);
    const qRaw = query.q?.trim();

    const qb = this.pollRepo
      .createQueryBuilder('poll')
      .where('poll.condominiumId = :cid', { cid: condominiumId });
    if (!includeArchived) {
      qb.andWhere('poll.archivedAt IS NULL');
    }

    if (qRaw) {
      const safe = qRaw.replace(/[%_]/g, '').trim();
      if (!safe) {
        throw new BadRequestException('Indique texto para buscar no título.');
      }
      qb.andWhere('LOWER(poll.title) LIKE :pat', {
        pat: `%${safe.toLowerCase()}%`,
      });
    } else {
      const hasFrom = !!query.registeredFrom?.trim();
      const hasTo = !!query.registeredTo?.trim();
      if (hasFrom !== hasTo) {
        throw new BadRequestException(
          'Informe «registeredFrom» e «registeredTo», ou omita ambos para o período padrão (30 dias).',
        );
      }
      let from: Date;
      let to: Date;
      if (hasFrom && hasTo) {
        from = this.parseUtcDayStart(query.registeredFrom!);
        to = this.parseUtcDayEnd(query.registeredTo!);
        if (from.getTime() > to.getTime()) {
          throw new BadRequestException(
            'A data inicial do registro não pode ser posterior à data final.',
          );
        }
      } else {
        ({ from, to } = this.defaultRegisteredRangeUtc());
      }
      qb.andWhere('poll.createdAt >= :rFrom', { rFrom: from }).andWhere(
        'poll.createdAt <= :rTo',
        { rTo: to },
      );
    }

    const ordered = await qb
      .orderBy('poll.competenceDate', 'DESC')
      .addOrderBy('poll.createdAt', 'DESC')
      .addOrderBy('poll.id', 'DESC')
      .take(limit)
      .getMany();
    const ids = ordered.map((p) => p.id);
    if (ids.length === 0) {
      return [];
    }
    const list = await this.pollRepo.find({
      where: { id: In(ids), condominiumId },
      relations: { questions: { options: true }, attachments: true },
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    list.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    for (const p of list) {
      this.normalizePollRelations(p);
    }
    if (!query.includeMyVotes) {
      return list;
    }
    const pollIdsWithOptions = list
      .filter((p) => pollHasVoting(p))
      .map((p) => p.id);
    const snapshot = await this.buildMyVotesSnapshotForPolls(
      condominiumId,
      userId,
      pollIdsWithOptions,
    );
    return list.map((p) =>
      Object.assign(p, {
        myVote: snapshot[p.id] ?? { byUnit: [] },
      }),
    );
  }

  async getOne(condominiumId: string, pollId: string, userId: string) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.archivedAt) {
      await this.governance.assertSyndicOrOwner(condominiumId, userId);
    }
    return poll;
  }

  async archive(
    condominiumId: string,
    pollId: string,
    userId: string,
  ): Promise<PlanningPoll> {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.archivedAt) {
      throw new BadRequestException('Esta pauta já está arquivada.');
    }
    poll.archivedAt = new Date();
    await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, pollId);
  }

  async deleteDraft(
    condominiumId: string,
    pollId: string,
    userId: string,
  ): Promise<{ ok: true }> {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.status !== PlanningPollStatus.Draft) {
      throw new BadRequestException(
        'Só pautas em rascunho podem ser excluídas.',
      );
    }
    const attachments = await this.attachmentRepo.find({
      where: { pollId: poll.id },
    });
    for (const att of attachments) {
      try {
        await this.attachmentStorage.deletePollAttachment(
          condominiumId,
          att.storageKey,
        );
      } catch {
        /* ficheiro pode já não existir */
      }
    }
    await this.pollRepo.delete({ id: poll.id, condominiumId });
    return { ok: true };
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreatePlanningPollDto,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const opens = new Date(dto.opensAt);
    const closes = new Date(dto.closesAt);
    if (closes <= opens) {
      throw new BadRequestException('closesAt deve ser posterior a opensAt.');
    }
    const questionInputs = resolveQuestionInputsFromCreate(dto);
    const legacyAllowMultiple =
      dto.assemblyType === AssemblyType.Ata
        ? false
        : (questionInputs[0]?.allowMultiple ?? dto.allowMultiple ?? false);
    const competenceSrc =
      dto.competenceDate?.trim() || new Date().toISOString().slice(0, 10);
    const competenceYmd = this.normalizeCompetenceYmdOrThrow(competenceSrc);
    const pollId = randomUUID();
    const poll = this.pollRepo.create({
      id: pollId,
      condominiumId,
      title: dto.title,
      body: sanitizePollBodyRich(dto.body) ?? null,
      minutesBody: null,
      opensAt: opens,
      closesAt: closes,
      competenceDate: competenceYmd,
      status: PlanningPollStatus.Draft,
      assemblyType: dto.assemblyType,
      allowMultiple: legacyAllowMultiple,
      decidedOptionId: null,
      createdByUserId: userId,
      questions: buildQuestionEntities(pollId, questionInputs),
    });
    const saved = await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, saved.id);
  }

  private async replacePollQuestions(
    pollId: string,
    inputs: ReturnType<typeof resolveQuestionInputsFromCreate>,
  ): Promise<void> {
    await this.voteRepo.delete({ pollId });
    await this.questionRepo.delete({ pollId });
    if (inputs.length === 0) {
      return;
    }
    await this.questionRepo.save(buildQuestionEntities(pollId, inputs));
  }

  async update(
    condominiumId: string,
    pollId: string,
    userId: string,
    dto: UpdatePlanningPollDto,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    const prevAssembly = poll.assemblyType;
    const touchesAssemblyConfig =
      dto.assemblyType !== undefined ||
      dto.allowMultiple !== undefined ||
      dto.options !== undefined ||
      dto.questions !== undefined;
    if (touchesAssemblyConfig) {
      if (poll.status !== PlanningPollStatus.Draft) {
        throw new BadRequestException(
          'Tipo de assembleia, deliberações e opções só são editáveis em rascunho.',
        );
      }
    }

    const nextAssembly = dto.assemblyType ?? poll.assemblyType;
    let resolvedQuestions: ReturnType<
      typeof resolveQuestionInputsFromUpdate
    > = null;
    if (touchesAssemblyConfig && poll.status === PlanningPollStatus.Draft) {
      resolvedQuestions = resolveQuestionInputsFromUpdate(
        dto,
        poll,
        nextAssembly,
      );
      if (
        prevAssembly === AssemblyType.Ata &&
        dto.assemblyType !== undefined &&
        dto.assemblyType !== AssemblyType.Ata &&
        resolvedQuestions === null
      ) {
        throw new BadRequestException(
          'Ao sair do tipo «Ata», envie «questions» (ou «options» legado) com pelo menos uma deliberação.',
        );
      }
    }

    if (dto.title !== undefined) {
      const canEditTitle =
        poll.status === PlanningPollStatus.Draft ||
        poll.status === PlanningPollStatus.Open ||
        poll.status === PlanningPollStatus.Closed;
      if (!canEditTitle) {
        throw new BadRequestException(
          'Título só pode ser editado em rascunho, com pauta aberta ou encerrada (antes da decisão final).',
        );
      }
      poll.title = dto.title.trim();
    }
    if (dto.body !== undefined) {
      const canEditBody =
        poll.status === PlanningPollStatus.Draft ||
        poll.status === PlanningPollStatus.Open ||
        poll.status === PlanningPollStatus.Closed ||
        poll.status === PlanningPollStatus.Decided;
      if (!canEditBody) {
        throw new BadRequestException(
          'Descrição não pode ser alterada neste estado da pauta.',
        );
      }
      poll.body = sanitizePollBodyRich(dto.body) ?? null;
    }
    if (dto.minutesBody !== undefined) {
      const canEditMinutes =
        poll.status === PlanningPollStatus.Draft ||
        poll.status === PlanningPollStatus.Open ||
        poll.status === PlanningPollStatus.Closed ||
        poll.status === PlanningPollStatus.Decided;
      if (!canEditMinutes) {
        throw new BadRequestException(
          'Rascunho da ata não pode ser alterado neste estado da pauta.',
        );
      }
      poll.minutesBody = sanitizePollBodyRich(dto.minutesBody) ?? null;
    }
    if (dto.opensAt !== undefined || dto.closesAt !== undefined) {
      if (poll.status !== PlanningPollStatus.Draft) {
        throw new BadRequestException(
          'Datas de abertura/encerramento só são editáveis em rascunho.',
        );
      }
      const opens = dto.opensAt ? new Date(dto.opensAt) : poll.opensAt;
      const closes = dto.closesAt ? new Date(dto.closesAt) : poll.closesAt;
      if (closes <= opens) {
        throw new BadRequestException('closesAt deve ser posterior a opensAt.');
      }
      if (dto.opensAt) {
        poll.opensAt = opens;
      }
      if (dto.closesAt) {
        poll.closesAt = closes;
      }
    }
    if (dto.competenceDate !== undefined) {
      const canEditCompetence =
        poll.status === PlanningPollStatus.Draft ||
        poll.status === PlanningPollStatus.Open ||
        poll.status === PlanningPollStatus.Closed ||
        poll.status === PlanningPollStatus.Decided;
      if (!canEditCompetence) {
        throw new BadRequestException(
          'Data de competência não pode ser alterada neste estado.',
        );
      }
      poll.competenceDate = this.normalizeCompetenceYmdOrThrow(
        dto.competenceDate,
      );
    }
    if (dto.assemblyType !== undefined) {
      poll.assemblyType = dto.assemblyType;
    }
    if (dto.allowMultiple !== undefined) {
      poll.allowMultiple = dto.allowMultiple;
    }
    if (
      poll.assemblyType === AssemblyType.Election ||
      poll.assemblyType === AssemblyType.Ata
    ) {
      poll.allowMultiple = false;
    }

    if (resolvedQuestions !== null && poll.status === PlanningPollStatus.Draft) {
      await this.replacePollQuestions(poll.id, resolvedQuestions);
      poll.decidedOptionId = null;
      poll.allowMultiple =
        poll.assemblyType === AssemblyType.Ata
          ? false
          : (resolvedQuestions[0]?.allowMultiple ?? poll.allowMultiple);
    }

    if (dto.status !== undefined) {
      poll.status = dto.status;
    }
    if (dto.decidedOptionId !== undefined) {
      poll.decidedOptionId = dto.decidedOptionId;
    }
    const saved = await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, saved.id);
  }

  /**
   * Alguns clientes enviam `application/octet-stream` (ou MIME vazio) para ficheiros
   * `.opus` exportados do WhatsApp. Normaliza para um tipo aceite pelo armazém.
   */
  private normalizePollAttachmentMimeType(file: Express.Multer.File): string {
    let mime = (file.mimetype ?? '').trim().toLowerCase();
    if (!mime) {
      mime = 'application/octet-stream';
    }
    if (this.attachmentStorage.isAllowedPollAttachmentMime(mime)) {
      return mime;
    }
    const name = (file.originalname ?? '').toLowerCase();
    if (name.endsWith('.opus') || name.endsWith('.oga')) {
      return 'audio/ogg';
    }
    return file.mimetype;
  }

  async addAttachment(
    condominiumId: string,
    pollId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo ausente.');
    }
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    const mimeType = this.normalizePollAttachmentMimeType(file);
    if (!this.attachmentStorage.isAllowedPollAttachmentMime(mimeType)) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido. Use PDF, imagem, Word, texto ou áudio (ex.: .opus).',
      );
    }
    const storageKey = await this.attachmentStorage.savePollAttachment(
      condominiumId,
      file.buffer,
      mimeType,
    );
    const maxRow = await this.attachmentRepo
      .createQueryBuilder('a')
      .select('MAX(a.sortOrder)', 'm')
      .where('a.pollId = :pid', { pid: poll.id })
      .getRawOne<{ m: string | null }>();
    const nextOrder = Number(maxRow?.m ?? -1) + 1;
    const orig = normalizeMulterOriginalName(
      file.originalname || 'anexo',
    )
      .trim()
      .slice(0, 500);
    const att = this.attachmentRepo.create({
      id: randomUUID(),
      pollId: poll.id,
      storageKey,
      originalFilename: orig || 'anexo',
      mimeType,
      sizeBytes: file.size,
      sortOrder: nextOrder,
      uploadedByUserId: userId,
    });
    await this.attachmentRepo.save(att);
    return this.loadPollForCondo(condominiumId, poll.id);
  }

  async removeAttachment(
    condominiumId: string,
    pollId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    const att = await this.attachmentRepo.findOne({
      where: { id: attachmentId, pollId: poll.id },
    });
    if (!att) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    await this.attachmentStorage.deletePollAttachment(
      condominiumId,
      att.storageKey,
    );
    await this.attachmentRepo.remove(att);
    return this.loadPollForCondo(condominiumId, poll.id);
  }

  async getAttachmentFile(
    condominiumId: string,
    pollId: string,
    attachmentId: string,
    userId: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    const att = await this.attachmentRepo.findOne({
      where: { id: attachmentId, pollId: poll.id },
    });
    if (!att) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    const { buffer, contentType } = await this.attachmentStorage.readPollAttachment(
      condominiumId,
      att.storageKey,
    );
    return {
      buffer,
      contentType,
      filename: repairMojibakeUtf8Filename(att.originalFilename),
    };
  }

  async open(condominiumId: string, pollId: string, userId: string) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.status !== PlanningPollStatus.Draft) {
      throw new BadRequestException('Só rascunhos podem ser abertos.');
    }
    if (poll.assemblyType !== AssemblyType.Ata && !pollHasVoting(poll)) {
      throw new BadRequestException(
        'Indique pelo menos uma deliberação com duas opções antes de abrir a votação.',
      );
    }
    poll.status = PlanningPollStatus.Open;
    await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, pollId);
  }

  async close(condominiumId: string, pollId: string, userId: string) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.status !== PlanningPollStatus.Open) {
      throw new BadRequestException('Só pautas abertas podem ser encerradas.');
    }
    poll.status = PlanningPollStatus.Closed;
    await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, pollId);
  }

  async finalizeAtaPoll(condominiumId: string, pollId: string, userId: string) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.assemblyType !== AssemblyType.Ata) {
      throw new BadRequestException(
        'Este encerramento só se aplica a pautas do tipo «Ata».',
      );
    }
    if (poll.status !== PlanningPollStatus.Closed) {
      throw new BadRequestException(
        'Encerre a pauta antes de concluir o registro da ata.',
      );
    }
    poll.status = PlanningPollStatus.Decided;
    poll.decidedOptionId = null;
    await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, pollId);
  }

  async decide(
    condominiumId: string,
    pollId: string,
    userId: string,
    questionId: string,
    optionId: string,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.assemblyType === AssemblyType.Ata) {
      throw new BadRequestException(
        'Pautas «Ata» não têm opção vencedora; use «Concluir registro da ata».',
      );
    }
    if (poll.status !== PlanningPollStatus.Closed) {
      throw new BadRequestException('Encerre a pauta antes de decidir.');
    }
    const question = sortedPollQuestions(poll).find((q) => q.id === questionId);
    if (!question) {
      throw new BadRequestException('Deliberação inválida.');
    }
    const opt = question.options?.find((o) => o.id === optionId);
    if (!opt) {
      throw new BadRequestException('Opção inválida.');
    }
    question.decidedOptionId = optionId;
    await this.questionRepo.save(question);
    poll.decidedOptionId = optionId;
    const refreshed = await this.loadPollForCondo(condominiumId, pollId);
    if (allQuestionsDecided(refreshed)) {
      refreshed.status = PlanningPollStatus.Decided;
      await this.pollRepo.save(refreshed);
    }
    return this.loadPollForCondo(condominiumId, pollId);
  }

  async registerFinalResolution(
    condominiumId: string,
    pollId: string,
    userId: string,
    dto: RegisterPollFinalResolutionDto,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.status !== PlanningPollStatus.Closed) {
      throw new BadRequestException(
        'Só pautas encerradas podem receber parecer final inconclusivo.',
      );
    }
    const opinion = dto.opinion.trim();
    if (!opinion) {
      throw new BadRequestException('Indique o parecer final.');
    }
    poll.finalOpinion = opinion;
    if (dto.outcome === PollFinalResolutionOutcome.Postpone) {
      if (dto.opensAt !== undefined || dto.closesAt !== undefined) {
        const opens = dto.opensAt ? new Date(dto.opensAt) : poll.opensAt;
        const closes = dto.closesAt ? new Date(dto.closesAt) : poll.closesAt;
        if (closes <= opens) {
          throw new BadRequestException(
            'closesAt deve ser posterior a opensAt.',
          );
        }
        if (dto.opensAt) {
          poll.opensAt = opens;
        }
        if (dto.closesAt) {
          poll.closesAt = closes;
        }
      }
      poll.status = PlanningPollStatus.Postponed;
    } else {
      poll.status = PlanningPollStatus.Withdrawn;
    }
    await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, pollId);
  }

  async resumePostponedPoll(
    condominiumId: string,
    pollId: string,
    userId: string,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.status !== PlanningPollStatus.Postponed) {
      throw new BadRequestException(
        'Só pautas prorrogadas podem ser retomadas para rascunho.',
      );
    }
    poll.status = PlanningPollStatus.Draft;
    await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, pollId);
  }

  async results(condominiumId: string, pollId: string, userId: string) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    const canSeeUnitDetail = await this.governance.canViewAggregatesWithUnitDetail(
      condominiumId,
      userId,
    );
    if (
      !canSeeUnitDetail &&
      poll.status !== PlanningPollStatus.Closed &&
      poll.status !== PlanningPollStatus.Decided &&
      poll.status !== PlanningPollStatus.Postponed &&
      poll.status !== PlanningPollStatus.Withdrawn
    ) {
      throw new ForbiddenException(
        'Resultados ainda não estão disponíveis para a sua situação (a pauta ainda não foi encerrada).',
      );
    }
    const questions = sortedPollQuestions(poll);
    const allOpts = allPollOptions(poll);
    const optionToQuestion = new Map<string, string>();
    for (const q of questions) {
      for (const o of q.options ?? []) {
        optionToQuestion.set(o.id, q.id);
      }
    }

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

    const voteRows = await this.voteRepo
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.unit', 'u')
      .innerJoinAndSelect('v.option', 'o')
      .where('v.pollId = :pid', { pid: poll.id })
      .orderBy('u.identifier', 'ASC')
      .addOrderBy('o.sortOrder', 'ASC')
      .addOrderBy('o.label', 'ASC')
      .getMany();

    const questionResults = questions.map((q) => {
      const qOptionIds = new Set((q.options ?? []).map((o) => o.id));
      const unitsForQ = new Set<string>();
      let selections = 0;
      const byUnit = new Map<
        string,
        {
          unitId: string;
          identifier: string;
          choices: { id: string; label: string }[];
        }
      >();
      for (const row of voteRows) {
        if (!qOptionIds.has(row.optionId)) continue;
        unitsForQ.add(row.unitId);
        selections += 1;
        if (!byUnit.has(row.unitId)) {
          byUnit.set(row.unitId, {
            unitId: row.unitId,
            identifier: row.unit.identifier,
            choices: [],
          });
        }
        byUnit.get(row.unitId)!.choices.push({
          id: row.option.id,
          label: row.option.label,
        });
      }
      return {
        questionId: q.id,
        title: q.title,
        allowMultiple: q.allowMultiple,
        decidedOptionId: q.decidedOptionId,
        options: (q.options ?? []).map((o) => ({
          id: o.id,
          label: o.label,
          votes: counts[o.id] ?? 0,
        })),
        unitsVoted: unitsForQ.size,
        totalOptionSelections: selections,
        votesByUnit: canSeeUnitDetail ? [...byUnit.values()] : [],
      };
    });

    const unitsRow = await this.voteRepo
      .createQueryBuilder('v')
      .select('COUNT(DISTINCT v.unitId)', 'cnt')
      .where('v.pollId = :pollId', { pollId: poll.id })
      .getRawOne<{ cnt: string }>();
    const unitsVoted = Number(unitsRow?.cnt ?? 0);
    const optionSelections = Object.values(counts).reduce((a, b) => a + b, 0);

    const byUnitAll = new Map<
      string,
      { unitId: string; identifier: string; choices: { id: string; label: string }[] }
    >();
    for (const row of voteRows) {
      const uid = row.unitId;
      if (!byUnitAll.has(uid)) {
        byUnitAll.set(uid, {
          unitId: uid,
          identifier: row.unit.identifier,
          choices: [],
        });
      }
      byUnitAll.get(uid)!.choices.push({
        id: row.option.id,
        label: row.option.label,
      });
    }

    return {
      pollId: poll.id,
      status: poll.status,
      allowMultiple: poll.allowMultiple,
      questions: questionResults,
      options: allOpts.map((o) => ({
        id: o.id,
        label: o.label,
        votes: counts[o.id] ?? 0,
        questionId: optionToQuestion.get(o.id) ?? null,
      })),
      unitsVoted,
      totalOptionSelections: optionSelections,
      votesByUnit: canSeeUnitDetail ? [...byUnitAll.values()] : [],
    };
  }

  /**
   * Titular do condomínio ou síndico (participante): podem registrar voto em nome
   * da própria unidade ou de qualquer outra; fora do prazo de votação quando aplicável.
   * (Subsíndico/admin seguem regras de morador neste fluxo.)
   */
  private async canVoteForAnyUnit(
    condominiumId: string,
    userId: string,
  ): Promise<boolean> {
    const access = await this.governance.resolveAccess(condominiumId, userId);
    if (access?.kind === 'owner') {
      return true;
    }
    return (
      access?.kind === 'participant' && access.role === GovernanceRole.Syndic
    );
  }

  private async assertUserRepresentsUnit(
    unit: Unit,
    userId: string,
  ): Promise<void> {
    const personIds = [
      unit.ownerPersonId,
      ...(unit.responsibleLinks ?? []).map((l) => l.personId),
    ].filter(Boolean) as string[];
    if (personIds.length === 0) {
      throw new ForbiddenException('Unidade sem representante definido.');
    }
    const people = await this.personRepo.find({
      where: { id: In(personIds) },
    });
    const ok = people.some((p) => p.userId === userId);
    if (!ok) {
      throw new ForbiddenException(
        'Só o proprietário ou responsável associado à conta podem votar por esta unidade.',
      );
    }
  }

  async castVote(
    condominiumId: string,
    pollId: string,
    userId: string,
    dto: CastVoteDto,
  ) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (!pollHasVoting(poll)) {
      throw new BadRequestException(
        'Esta pauta não admite votação eletrônica.',
      );
    }
    const extendedUnitVote = await this.canVoteForAnyUnit(
      condominiumId,
      userId,
    );
    const now = new Date();

    if (!extendedUnitVote) {
      if (poll.status !== PlanningPollStatus.Open) {
        throw new BadRequestException('A pauta não está aberta para votação.');
      }
      if (now < poll.opensAt || now > poll.closesAt) {
        throw new BadRequestException('Fora do período de votação.');
      }
    } else {
      // Titular/síndico: sem restrição de opensAt/closesAt; podem votar a qualquer momento
      // enquanto a pauta não estiver decidida.
      if (
        poll.status !== PlanningPollStatus.Draft &&
        poll.status !== PlanningPollStatus.Open &&
        poll.status !== PlanningPollStatus.Closed
      ) {
        throw new BadRequestException(
          'Como titular ou síndico, só é possível registrar votos em rascunho, com votação aberta ou encerrada (antes da deliberação final).',
        );
      }
    }

    const unit = await this.unitRepo.findOne({
      where: { id: dto.unitId },
      relations: { responsibleLinks: { person: true }, ownerPerson: true },
    });
    if (!unit) {
      throw new NotFoundException('Unidade não encontrada.');
    }
    const g = await this.groupingRepo.findOne({
      where: { id: unit.groupingId, condominiumId },
    });
    if (!g) {
      throw new ForbiddenException('Unidade não pertence a este condomínio.');
    }
    if (!extendedUnitVote) {
      await this.assertUserRepresentsUnit(unit, userId);
    }
    const submittedOptionIds = this.uniqueOptionIdsInOrder(dto.optionIds);
    if (submittedOptionIds.length === 0) {
      throw new BadRequestException('Indique pelo menos uma opção de voto.');
    }
    const questions = sortedPollQuestions(poll);
    const optionMeta = new Map<
      string,
      { questionId: string; allowMultiple: boolean }
    >();
    for (const q of questions) {
      for (const o of q.options ?? []) {
        optionMeta.set(o.id, {
          questionId: q.id,
          allowMultiple: q.allowMultiple,
        });
      }
    }
    for (const oid of submittedOptionIds) {
      if (!optionMeta.has(oid)) {
        throw new BadRequestException('Opção inválida para esta pauta.');
      }
    }
    const existingRows = await this.voteRepo.find({
      where: { pollId: poll.id, unitId: dto.unitId },
    });
    const existingOptionIds = existingRows.map((r) => r.optionId);
    const optionIds = this.mergeUnitVoteOptionIds(
      questions,
      existingOptionIds,
      submittedOptionIds,
    );
    if (optionIds.length === 0) {
      throw new BadRequestException('Indique pelo menos uma opção de voto.');
    }
    const byQuestion = new Map<string, string[]>();
    for (const oid of optionIds) {
      const meta = optionMeta.get(oid)!;
      if (!byQuestion.has(meta.questionId)) {
        byQuestion.set(meta.questionId, []);
      }
      byQuestion.get(meta.questionId)!.push(oid);
    }
    for (const q of questions) {
      const oids = byQuestion.get(q.id) ?? [];
      if (!extendedUnitVote && oids.length === 0) {
        throw new BadRequestException(
          `Responda a deliberação: «${q.title}».`,
        );
      }
      if (!q.allowMultiple && oids.length > 1) {
        throw new BadRequestException(
          `A deliberação «${q.title}» aceita apenas uma opção por unidade.`,
        );
      }
    }
    const castAt = new Date();
    await this.voteRepo.delete({ pollId: poll.id, unitId: dto.unitId });
    const rows = optionIds.map((optionId) =>
      this.voteRepo.create({
        id: randomUUID(),
        pollId: poll.id,
        unitId: dto.unitId,
        optionId,
        castByUserId: userId,
        castAt,
      }),
    );
    await this.voteRepo.save(rows);
    return { ok: true };
  }

  async applyAiMeetingVotes(
    condominiumId: string,
    pollId: string,
    userId: string,
    entries: {
      unitIdentifier: string;
      selections: { questionIndex: number; optionIndex: number }[];
    }[],
  ): Promise<
    { unitIdentifier: string; ok: boolean; message?: string }[]
  > {
    if (!entries.length) {
      return [];
    }
    if (!(await this.canVoteForAnyUnit(condominiumId, userId))) {
      return entries.map((e) => ({
        unitIdentifier: e.unitIdentifier,
        ok: false,
        message: 'Sem permissão para registar votos pela IA.',
      }));
    }
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (!pollHasVoting(poll)) {
      return entries.map((e) => ({
        unitIdentifier: e.unitIdentifier,
        ok: false,
        message: 'Esta pauta não admite votação.',
      }));
    }
    const units = await this.myVotableUnits(condominiumId, userId);
    const questions = sortedPollQuestions(poll);
    const out: { unitIdentifier: string; ok: boolean; message?: string }[] =
      [];
    for (const entry of entries) {
      const label = String(entry.unitIdentifier ?? '').trim();
      if (!label) {
        out.push({
          unitIdentifier: label || '—',
          ok: false,
          message: 'Unidade não indicada.',
        });
        continue;
      }
      try {
        const unit = this.matchUnitForAiVote(units, label);
        if (!unit) {
          throw new BadRequestException(
            `Unidade «${label}» não encontrada.`,
          );
        }
        const optionIds: string[] = [];
        for (const sel of entry.selections ?? []) {
          const qi = Number(sel.questionIndex);
          const oi = Number(sel.optionIndex);
          if (!Number.isFinite(qi) || !Number.isFinite(oi)) {
            throw new BadRequestException('Índices de deliberação/opção inválidos.');
          }
          const q = questions[Math.trunc(qi) - 1];
          if (!q) {
            throw new BadRequestException(
              `Deliberação ${Math.trunc(qi)} inválida.`,
            );
          }
          const opts = q.options ?? [];
          const opt = opts[Math.trunc(oi) - 1];
          if (!opt) {
            throw new BadRequestException(
              `Opção ${Math.trunc(oi)} inválida na deliberação ${Math.trunc(qi)}.`,
            );
          }
          optionIds.push(opt.id);
        }
        if (optionIds.length === 0) {
          throw new BadRequestException('Nenhuma opção de voto indicada.');
        }
        await this.castVote(condominiumId, pollId, userId, {
          unitId: unit.id,
          optionIds,
        });
        out.push({ unitIdentifier: label, ok: true });
      } catch (err) {
        out.push({
          unitIdentifier: label,
          ok: false,
          message: this.humanizeVoteError(err),
        });
      }
    }
    return out;
  }

  private matchUnitForAiVote(
    units: { id: string; identifier: string }[],
    raw: string,
  ): { id: string; identifier: string } | null {
    const norm = (s: string) =>
      s.trim().toLowerCase().replace(/\s+/g, ' ');
    const target = norm(raw);
    const exact = units.find((u) => norm(u.identifier) === target);
    if (exact) {
      return exact;
    }
    const digits = target.replace(/\D/g, '');
    if (digits) {
      const matches = units.filter(
        (u) => norm(u.identifier).replace(/\D/g, '') === digits,
      );
      if (matches.length === 1) {
        return matches[0];
      }
    }
    return null;
  }

  private humanizeVoteError(err: unknown): string {
    if (err instanceof BadRequestException || err instanceof ForbiddenException) {
      const r = err.getResponse();
      if (typeof r === 'string') {
        return r;
      }
      if (r && typeof r === 'object' && 'message' in r) {
        const m = (r as { message: unknown }).message;
        if (Array.isArray(m)) {
          return m.map(String).join('; ');
        }
        if (typeof m === 'string') {
          return m;
        }
      }
    }
    if (err instanceof NotFoundException) {
      return err.message;
    }
    return err instanceof Error ? err.message : 'Falha ao registar voto.';
  }

  /**
   * Mescla votos enviados com os já registados na unidade: deliberações presentes
   * no pedido são substituídas; as restantes mantêm o voto anterior.
   */
  private mergeUnitVoteOptionIds(
    questions: ReturnType<typeof sortedPollQuestions>,
    existingOptionIds: string[],
    submittedOptionIds: string[],
  ): string[] {
    const submittedQuestionIds = new Set<string>();
    for (const oid of submittedOptionIds) {
      for (const q of questions) {
        if ((q.options ?? []).some((o) => o.id === oid)) {
          submittedQuestionIds.add(q.id);
          break;
        }
      }
    }
    const merged: string[] = [];
    for (const q of questions) {
      const qOptIds = new Set((q.options ?? []).map((o) => o.id));
      const submittedForQ = submittedOptionIds.filter((id) => qOptIds.has(id));
      const existingForQ = existingOptionIds.filter((id) => qOptIds.has(id));
      if (submittedQuestionIds.has(q.id)) {
        merged.push(...submittedForQ);
      } else {
        merged.push(...existingForQ);
      }
    }
    return this.uniqueOptionIdsInOrder(merged);
  }

  /** Uma opção por entrada; sem duplicados (cada unidade só tem um voto substituível). */
  private uniqueOptionIdsInOrder(raw: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of raw) {
      const t = id?.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }

  /**
   * Unidades em que o utilizador é proprietário ou responsável (conta ligada).
   * Não inclui o alargamento de «votar por qualquer unidade» (titular do
   * condomínio / síndico). Usado para lembrete «o seu voto» (só as unidades
   * pessoais).
   */
  private async myRepresentedUnitsOnly(
    condominiumId: string,
    userId: string,
  ): Promise<{ id: string; identifier: string }[]> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    return this.representedUnitsList(condominiumId, userId);
  }

  /**
   * Exige `assertAnyAccess` já feito pelo chamador.
   */
  private readonly votableUnitRelations = {
    ownerPerson: true,
    financialResponsiblePerson: true,
    responsibleLinks: { person: true },
  } as const;

  private mapVotableUnit(u: Unit): VotableUnitRow {
    return {
      id: u.id,
      identifier: u.identifier,
      responsibleName: resolveUnitFinancialResponsibleDisplayName({
        financialResponsiblePerson: u.financialResponsiblePerson,
        responsibleLinks: u.responsibleLinks,
        responsibleDisplayName: u.responsibleDisplayName,
      }),
    };
  }

  private async representedUnitsList(
    condominiumId: string,
    userId: string,
  ): Promise<VotableUnitRow[]> {
    const groupings = await this.groupingRepo.find({
      where: { condominiumId },
      select: ['id'],
    });
    const gids = groupings.map((x) => x.id);
    if (gids.length === 0) {
      return [];
    }
    const units = await this.unitRepo.find({
      where: { groupingId: In(gids) },
      relations: this.votableUnitRelations,
      order: { identifier: 'ASC' },
    });
    const out: VotableUnitRow[] = [];
    for (const u of units) {
      try {
        await this.assertUserRepresentsUnit(u, userId);
        out.push(this.mapVotableUnit(u));
      } catch {
        /* skip */
      }
    }
    return out;
  }

  async myVotableUnits(
    condominiumId: string,
    userId: string,
  ): Promise<VotableUnitRow[]> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    if (await this.canVoteForAnyUnit(condominiumId, userId)) {
      const groupings = await this.groupingRepo.find({
        where: { condominiumId },
        select: ['id'],
      });
      const gids = groupings.map((x) => x.id);
      if (gids.length === 0) {
        return [];
      }
      const units = await this.unitRepo.find({
        where: { groupingId: In(gids) },
        relations: this.votableUnitRelations,
        order: { identifier: 'ASC' },
      });
      return units.map((u) => this.mapVotableUnit(u));
    }
    return this.representedUnitsList(condominiumId, userId);
  }

  /**
   * Voto(s) registado(s) para as unidades pessoais do utilizador (titular/
   * responsável). Síndico/titular do condomínio vê o lembrete só destas, não
   * de todas as unidades em que podem intervir.
   */
  private async buildMyVotesSnapshotForPolls(
    condominiumId: string,
    userId: string,
    pollIds: string[],
  ): Promise<
    Record<
      string,
      {
        byUnit: {
          unitId: string;
          identifier: string;
          choices: { id: string; label: string }[];
        }[];
      }
    >
  > {
    const out: Record<
      string,
      {
        byUnit: {
          unitId: string;
          identifier: string;
          choices: { id: string; label: string }[];
        }[];
      }
    > = {};
    for (const id of pollIds) {
      out[id] = { byUnit: [] };
    }
    if (pollIds.length === 0) {
      return out;
    }
    const myUnits = await this.myRepresentedUnitsOnly(condominiumId, userId);
    if (myUnits.length === 0) {
      return out;
    }
    const unitIds = myUnits.map((u) => u.id);
    const idToLabel = new Map(
      myUnits.map((u) => [u.id, u.identifier] as const),
    );
    const rows = await this.voteRepo.find({
      where: { pollId: In(pollIds), unitId: In(unitIds) },
      relations: { option: true, unit: true },
    });
    rows.sort((a, b) => {
      const ua = a.unit?.identifier ?? '';
      const ub = b.unit?.identifier ?? '';
      if (ua !== ub) {
        return ua.localeCompare(ub, 'pt', { numeric: true });
      }
      const sa = a.option?.sortOrder ?? 0;
      const sb = b.option?.sortOrder ?? 0;
      if (sa !== sb) {
        return sa - sb;
      }
      return (a.option?.label ?? '').localeCompare(
        b.option?.label ?? '',
        'pt',
        { numeric: true },
      );
    });
    const byPoll = new Map<
      string,
      Map<string, { id: string; label: string }[]>
    >();
    for (const v of rows) {
      if (!v.option) {
        continue;
      }
      if (!byPoll.has(v.pollId)) {
        byPoll.set(v.pollId, new Map());
      }
      const m = byPoll.get(v.pollId)!;
      if (!m.has(v.unitId)) {
        m.set(v.unitId, []);
      }
      m.get(v.unitId)!.push({
        id: v.option.id,
        label: v.option.label,
      });
    }
    for (const pid of pollIds) {
      const m = byPoll.get(pid);
      if (!m) {
        continue;
      }
      out[pid] = {
        byUnit: [...m.entries()]
          .sort((a, b) =>
            (idToLabel.get(a[0]) ?? a[0]).localeCompare(
              idToLabel.get(b[0]) ?? b[0],
              'pt',
              { numeric: true, sensitivity: 'base' },
            ),
          )
          .map(([unitId, choices]) => ({
            unitId,
            identifier: idToLabel.get(unitId) ?? unitId,
            choices,
          })),
      };
    }
    return out;
  }

  async getMyUnitVotesInPoll(
    condominiumId: string,
    pollId: string,
    userId: string,
  ): Promise<{
    byUnit: {
      unitId: string;
      identifier: string;
      choices: { id: string; label: string }[];
    }[];
  }> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (!pollHasVoting(poll)) {
      return { byUnit: [] };
    }
    const snap = await this.buildMyVotesSnapshotForPolls(
      condominiumId,
      userId,
      [poll.id],
    );
    return snap[poll.id] ?? { byUnit: [] };
  }
}
