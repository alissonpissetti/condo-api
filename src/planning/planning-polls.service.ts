import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import { In, Repository } from 'typeorm';
import { Grouping } from '../groupings/grouping.entity';
import { Person } from '../people/person.entity';
import { Unit } from '../units/unit.entity';
import { CastVoteDto } from './dto/cast-vote.dto';
import { CreatePlanningPollDto } from './dto/create-planning-poll.dto';
import { ListPlanningPollsQueryDto } from './dto/list-planning-polls.query.dto';
import { UpdatePlanningPollDto } from './dto/update-planning-poll.dto';
import { PlanningPollAttachment } from './entities/planning-poll-attachment.entity';
import { PlanningPollOption } from './entities/planning-poll-option.entity';
import { PlanningPollVote } from './entities/planning-poll-vote.entity';
import { PlanningPoll } from './entities/planning-poll.entity';
import { AssemblyType } from './enums/assembly-type.enum';
import { GovernanceRole } from './enums/governance-role.enum';
import { PlanningPollStatus } from './enums/planning-poll-status.enum';
import { GovernanceService } from './governance.service';
import { PollAttachmentStorageHelper } from './poll-attachment-storage.helper';
import { sanitizePollBodyRich } from './poll-body-sanitize';
import {
  normalizeMulterOriginalName,
  repairMojibakeUtf8Filename,
} from './upload-filename-encoding.util';

@Injectable()
export class PlanningPollsService {
  private readonly attachmentStorage: PollAttachmentStorageHelper;

  constructor(
    @InjectRepository(PlanningPoll)
    private readonly pollRepo: Repository<PlanningPoll>,
    @InjectRepository(PlanningPollOption)
    private readonly optionRepo: Repository<PlanningPollOption>,
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
    config: ConfigService,
  ) {
    this.attachmentStorage = new PollAttachmentStorageHelper(config);
  }

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
    if (poll.options?.length) {
      poll.options.sort((a, b) => a.sortOrder - b.sortOrder);
    }
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
      relations: { options: true, attachments: true },
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
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 100);
    const qRaw = query.q?.trim();

    const qb = this.pollRepo
      .createQueryBuilder('poll')
      .where('poll.condominiumId = :cid', { cid: condominiumId });

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
      relations: { options: true, attachments: true },
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    list.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    for (const p of list) {
      this.normalizePollRelations(p);
    }
    return list;
  }

  async getOne(condominiumId: string, pollId: string, userId: string) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    return this.loadPollForCondo(condominiumId, pollId);
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
    const allowMultiple = dto.allowMultiple ?? false;
    if (dto.assemblyType === AssemblyType.Election && allowMultiple) {
      throw new BadRequestException(
        'Eleições utilizam escolha única por unidade.',
      );
    }
    if (dto.assemblyType === AssemblyType.Ata) {
      if (allowMultiple) {
        throw new BadRequestException(
          'Pauta «Ata» não utiliza escolha múltipla.',
        );
      }
      if (dto.options?.length) {
        throw new BadRequestException(
          'Pauta «Ata» não admite opções de voto no sistema.',
        );
      }
    } else if (!dto.options || dto.options.length < 2) {
      throw new BadRequestException('Indique pelo menos duas opções de voto.');
    }
    const optionInputs =
      dto.assemblyType === AssemblyType.Ata ? [] : dto.options;
    const competenceSrc =
      dto.competenceDate?.trim() || new Date().toISOString().slice(0, 10);
    const competenceYmd = this.normalizeCompetenceYmdOrThrow(competenceSrc);
    const poll = this.pollRepo.create({
      id: randomUUID(),
      condominiumId,
      title: dto.title,
      body: sanitizePollBodyRich(dto.body) ?? null,
      opensAt: opens,
      closesAt: closes,
      competenceDate: competenceYmd,
      status: PlanningPollStatus.Draft,
      assemblyType: dto.assemblyType,
      allowMultiple,
      decidedOptionId: null,
      createdByUserId: userId,
      options: optionInputs.map((o, i) =>
        this.optionRepo.create({
          id: randomUUID(),
          label: o.label,
          sortOrder: i,
        }),
      ),
    });
    const saved = await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, saved.id);
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
      dto.options !== undefined;
    if (touchesAssemblyConfig) {
      if (poll.status !== PlanningPollStatus.Draft) {
        throw new BadRequestException(
          'Tipo de assembleia, opções e modo de votação só são editáveis em rascunho.',
        );
      }
    }

    if (touchesAssemblyConfig && poll.status === PlanningPollStatus.Draft) {
      const nextAssembly = dto.assemblyType ?? poll.assemblyType;
      let nextAllow = dto.allowMultiple ?? poll.allowMultiple;
      if (
        nextAssembly === AssemblyType.Election ||
        nextAssembly === AssemblyType.Ata
      ) {
        nextAllow = false;
      }
      if (nextAssembly === AssemblyType.Ata) {
        if (dto.options && dto.options.length > 0) {
          throw new BadRequestException(
            'Pauta «Ata» não admite opções de voto no sistema.',
          );
        }
      } else if (dto.options !== undefined) {
        const labels = dto.options
          .map((o) => o.label.trim())
          .filter(Boolean);
        if (labels.length < 2) {
          throw new BadRequestException(
            'Indique pelo menos duas opções de voto.',
          );
        }
      } else if (
        prevAssembly === AssemblyType.Ata &&
        dto.assemblyType !== undefined &&
        dto.assemblyType !== AssemblyType.Ata &&
        dto.options === undefined
      ) {
        throw new BadRequestException(
          'Ao sair do tipo «Ata», envie a lista «options» com pelo menos duas opções.',
        );
      }
      if (nextAssembly === AssemblyType.Election && nextAllow) {
        throw new BadRequestException(
          'Eleições utilizam escolha única por unidade.',
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

    if (touchesAssemblyConfig && poll.status === PlanningPollStatus.Draft) {
      if (poll.assemblyType === AssemblyType.Ata) {
        await this.optionRepo.delete({ pollId: poll.id });
        poll.decidedOptionId = null;
      } else if (dto.options !== undefined) {
        const labels = dto.options
          .map((o) => o.label.trim())
          .filter(Boolean);
        await this.optionRepo.delete({ pollId: poll.id });
        poll.decidedOptionId = null;
        const rows = labels.map((label, i) =>
          this.optionRepo.create({
            id: randomUUID(),
            pollId: poll.id,
            label,
            sortOrder: i,
          }),
        );
        await this.optionRepo.save(rows);
      }
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
    if (this.attachmentStorage.isAllowedMime(mime)) {
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
    if (!this.attachmentStorage.isAllowedMime(mimeType)) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido. Use PDF, imagem, Word, texto ou áudio (ex.: .opus).',
      );
    }
    const storageKey = await this.attachmentStorage.saveFile(
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
    await this.attachmentStorage.deleteFile(condominiumId, att.storageKey);
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
    const { buffer, contentType } = await this.attachmentStorage.readFile(
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
        'Encerre a pauta antes de concluir o registo da ata.',
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
    optionId: string,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.assemblyType === AssemblyType.Ata) {
      throw new BadRequestException(
        'Pautas «Ata» não têm opção vencedora; use «Concluir registo da ata».',
      );
    }
    if (poll.status !== PlanningPollStatus.Closed) {
      throw new BadRequestException('Encerre a pauta antes de decidir.');
    }
    const opt = poll.options?.find((o) => o.id === optionId);
    if (!opt) {
      throw new BadRequestException('Opção inválida.');
    }
    poll.decidedOptionId = optionId;
    poll.status = PlanningPollStatus.Decided;
    await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, pollId);
  }

  async results(condominiumId: string, pollId: string, userId: string) {
    await this.governance.assertCanViewAggregates(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
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
    const optionSelections = Object.values(counts).reduce((a, b) => a + b, 0);

    const voteRows = await this.voteRepo
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.unit', 'u')
      .innerJoinAndSelect('v.option', 'o')
      .where('v.pollId = :pid', { pid: poll.id })
      .orderBy('u.identifier', 'ASC')
      .addOrderBy('o.sortOrder', 'ASC')
      .addOrderBy('o.label', 'ASC')
      .getMany();
    const byUnit = new Map<
      string,
      { unitId: string; identifier: string; choices: { id: string; label: string }[] }
    >();
    for (const row of voteRows) {
      const uid = row.unitId;
      if (!byUnit.has(uid)) {
        byUnit.set(uid, {
          unitId: uid,
          identifier: row.unit.identifier,
          choices: [],
        });
      }
      byUnit.get(uid)!.choices.push({
        id: row.option.id,
        label: row.option.label,
      });
    }

    return {
      pollId: poll.id,
      status: poll.status,
      allowMultiple: poll.allowMultiple,
      options: (poll.options ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        votes: counts[o.id] ?? 0,
      })),
      unitsVoted,
      /** Soma das marcações por opção (numa pauta multi, pode exceder o nº de unidades). */
      totalOptionSelections: optionSelections,
      /** Uma linha por unidade que votou; cada unidade só tem um registro de voto (substituído ao reenviar). */
      votesByUnit: [...byUnit.values()],
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
    if (!(poll.options ?? []).length) {
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
    const optionIds = this.uniqueOptionIdsInOrder(dto.optionIds);
    if (optionIds.length === 0) {
      throw new BadRequestException('Indique pelo menos uma opção de voto.');
    }
    if (!poll.allowMultiple && optionIds.length !== 1) {
      throw new BadRequestException(
        'Esta pauta aceita apenas uma opção por unidade.',
      );
    }
    const validIds = new Set((poll.options ?? []).map((o) => o.id));
    for (const oid of optionIds) {
      if (!validIds.has(oid)) {
        throw new BadRequestException('Opção inválida para esta pauta.');
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

  async myVotableUnits(
    condominiumId: string,
    userId: string,
  ): Promise<{ id: string; identifier: string }[]> {
    await this.governance.assertAnyAccess(condominiumId, userId);
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
      relations: { ownerPerson: true, responsibleLinks: { person: true } },
      order: { identifier: 'ASC' },
    });
    if (await this.canVoteForAnyUnit(condominiumId, userId)) {
      return units.map((u) => ({ id: u.id, identifier: u.identifier }));
    }
    const out: { id: string; identifier: string }[] = [];
    for (const u of units) {
      try {
        await this.assertUserRepresentsUnit(u, userId);
        out.push({ id: u.id, identifier: u.identifier });
      } catch {
        /* skip */
      }
    }
    return out;
  }
}
