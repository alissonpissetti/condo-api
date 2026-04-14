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
import { UpdatePlanningPollDto } from './dto/update-planning-poll.dto';
import { PlanningPollAttachment } from './entities/planning-poll-attachment.entity';
import { PlanningPollOption } from './entities/planning-poll-option.entity';
import { PlanningPollVote } from './entities/planning-poll-vote.entity';
import { PlanningPoll } from './entities/planning-poll.entity';
import { AssemblyType } from './enums/assembly-type.enum';
import { PlanningPollStatus } from './enums/planning-poll-status.enum';
import { GovernanceService } from './governance.service';
import { PollAttachmentStorageHelper } from './poll-attachment-storage.helper';
import { sanitizePollBodyRich } from './poll-body-sanitize';

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

  private normalizePollRelations(poll: PlanningPoll): void {
    if (poll.options?.length) {
      poll.options.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    if (poll.attachments?.length) {
      poll.attachments.sort((a, b) => a.sortOrder - b.sortOrder);
    }
  }

  private assertCanEditAttachments(poll: PlanningPoll): void {
    if (
      poll.status !== PlanningPollStatus.Draft &&
      poll.status !== PlanningPollStatus.Open
    ) {
      throw new BadRequestException(
        'Anexos só podem ser alterados em rascunho ou com votação aberta.',
      );
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

  async list(condominiumId: string, userId: string) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const list = await this.pollRepo.find({
      where: { condominiumId },
      order: { createdAt: 'DESC' },
      relations: { options: true, attachments: true },
    });
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
    const poll = this.pollRepo.create({
      id: randomUUID(),
      condominiumId,
      title: dto.title,
      body: sanitizePollBodyRich(dto.body) ?? null,
      opensAt: opens,
      closesAt: closes,
      status: PlanningPollStatus.Draft,
      assemblyType: dto.assemblyType,
      allowMultiple,
      decidedOptionId: null,
      createdByUserId: userId,
      options: dto.options.map((o, i) =>
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
    if (dto.title !== undefined) {
      if (poll.status !== PlanningPollStatus.Draft) {
        throw new BadRequestException('Título só é editável em rascunho.');
      }
      poll.title = dto.title.trim();
    }
    if (dto.body !== undefined) {
      if (
        poll.status !== PlanningPollStatus.Draft &&
        poll.status !== PlanningPollStatus.Open
      ) {
        throw new BadRequestException(
          'Descrição só é editável em rascunho ou com votação aberta.',
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
    if (dto.status !== undefined) {
      poll.status = dto.status;
    }
    if (dto.decidedOptionId !== undefined) {
      poll.decidedOptionId = dto.decidedOptionId;
    }
    const saved = await this.pollRepo.save(poll);
    return this.loadPollForCondo(condominiumId, saved.id);
  }

  async addAttachment(
    condominiumId: string,
    pollId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Ficheiro em falta.');
    }
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    this.assertCanEditAttachments(poll);
    const storageKey = await this.attachmentStorage.saveFile(
      condominiumId,
      file.buffer,
      file.mimetype,
    );
    const maxRow = await this.attachmentRepo
      .createQueryBuilder('a')
      .select('MAX(a.sortOrder)', 'm')
      .where('a.pollId = :pid', { pid: poll.id })
      .getRawOne<{ m: string | null }>();
    const nextOrder = Number(maxRow?.m ?? -1) + 1;
    const orig = (file.originalname || 'anexo').trim().slice(0, 500);
    const att = this.attachmentRepo.create({
      id: randomUUID(),
      pollId: poll.id,
      storageKey,
      originalFilename: orig || 'anexo',
      mimeType: file.mimetype,
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
    this.assertCanEditAttachments(poll);
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
    return { buffer, contentType, filename: att.originalFilename };
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

  async decide(
    condominiumId: string,
    pollId: string,
    userId: string,
    optionId: string,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
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
    };
  }

  private async assertUserRepresentsUnit(
    unit: Unit,
    userId: string,
  ): Promise<void> {
    const ownerId = unit.ownerPersonId;
    const respId = unit.responsiblePersonId;
    const ids = [ownerId, respId].filter(Boolean) as string[];
    if (ids.length === 0) {
      throw new ForbiddenException('Unidade sem representante definido.');
    }
    const people = await this.personRepo.find({
      where: { id: In(ids) },
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
    const now = new Date();
    if (poll.status !== PlanningPollStatus.Open) {
      throw new BadRequestException('A pauta não está aberta para votação.');
    }
    if (now < poll.opensAt || now > poll.closesAt) {
      throw new BadRequestException('Fora do período de votação.');
    }
    const unit = await this.unitRepo.findOne({
      where: { id: dto.unitId },
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
    await this.assertUserRepresentsUnit(unit, userId);
    const optionIds = dto.optionIds;
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
      relations: { ownerPerson: true, responsiblePerson: true },
    });
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
