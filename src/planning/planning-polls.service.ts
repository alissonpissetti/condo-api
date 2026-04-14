import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { Grouping } from '../groupings/grouping.entity';
import { Person } from '../people/person.entity';
import { Unit } from '../units/unit.entity';
import { CastVoteDto } from './dto/cast-vote.dto';
import { CreatePlanningPollDto } from './dto/create-planning-poll.dto';
import { UpdatePlanningPollDto } from './dto/update-planning-poll.dto';
import { PlanningPollOption } from './entities/planning-poll-option.entity';
import { PlanningPollVote } from './entities/planning-poll-vote.entity';
import { PlanningPoll } from './entities/planning-poll.entity';
import { AssemblyType } from './enums/assembly-type.enum';
import { PlanningPollStatus } from './enums/planning-poll-status.enum';
import { GovernanceService } from './governance.service';

@Injectable()
export class PlanningPollsService {
  constructor(
    @InjectRepository(PlanningPoll)
    private readonly pollRepo: Repository<PlanningPoll>,
    @InjectRepository(PlanningPollOption)
    private readonly optionRepo: Repository<PlanningPollOption>,
    @InjectRepository(PlanningPollVote)
    private readonly voteRepo: Repository<PlanningPollVote>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly governance: GovernanceService,
  ) {}

  private async loadPollForCondo(condominiumId: string, pollId: string) {
    const poll = await this.pollRepo.findOne({
      where: { id: pollId, condominiumId },
      relations: { options: true },
    });
    if (!poll) {
      throw new NotFoundException('Pauta não encontrada.');
    }
    return poll;
  }

  async list(condominiumId: string, userId: string) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    return this.pollRepo.find({
      where: { condominiumId },
      order: { createdAt: 'DESC' },
      relations: { options: true },
    });
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
    const poll = this.pollRepo.create({
      id: randomUUID(),
      condominiumId,
      title: dto.title,
      body: dto.body ?? null,
      opensAt: opens,
      closesAt: closes,
      status: PlanningPollStatus.Draft,
      assemblyType: dto.assemblyType,
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
    return this.pollRepo.save(poll);
  }

  async update(
    condominiumId: string,
    pollId: string,
    userId: string,
    dto: UpdatePlanningPollDto,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (dto.status !== undefined) {
      poll.status = dto.status;
    }
    if (dto.decidedOptionId !== undefined) {
      poll.decidedOptionId = dto.decidedOptionId;
    }
    return this.pollRepo.save(poll);
  }

  async open(condominiumId: string, pollId: string, userId: string) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.status !== PlanningPollStatus.Draft) {
      throw new BadRequestException('Só rascunhos podem ser abertos.');
    }
    poll.status = PlanningPollStatus.Open;
    return this.pollRepo.save(poll);
  }

  async close(condominiumId: string, pollId: string, userId: string) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const poll = await this.loadPollForCondo(condominiumId, pollId);
    if (poll.status !== PlanningPollStatus.Open) {
      throw new BadRequestException('Só pautas abertas podem ser encerradas.');
    }
    poll.status = PlanningPollStatus.Closed;
    return this.pollRepo.save(poll);
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
    return this.pollRepo.save(poll);
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
    return {
      pollId: poll.id,
      status: poll.status,
      options: (poll.options ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        votes: counts[o.id] ?? 0,
      })),
      totalVotes: Object.values(counts).reduce((a, b) => a + b, 0),
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
    const optionBelongs = poll.options?.some((o) => o.id === dto.optionId);
    if (!optionBelongs) {
      throw new BadRequestException('Opção inválida para esta pauta.');
    }
    const existing = await this.voteRepo.findOne({
      where: { pollId: poll.id, unitId: dto.unitId },
    });
    if (existing) {
      existing.optionId = dto.optionId;
      existing.castByUserId = userId;
      existing.castAt = new Date();
      return this.voteRepo.save(existing);
    }
    return this.voteRepo.save(
      this.voteRepo.create({
        id: randomUUID(),
        pollId: poll.id,
        unitId: dto.unitId,
        optionId: dto.optionId,
        castByUserId: userId,
      }),
    );
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
