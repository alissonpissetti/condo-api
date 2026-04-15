import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Grouping } from '../groupings/grouping.entity';
import { SaasPlansService } from '../platform/saas-plans.service';
import { CondominiumParticipant } from '../planning/entities/condominium-participant.entity';
import { GovernanceRole } from '../planning/enums/governance-role.enum';
import { Condominium } from './condominium.entity';
import { CreateCondominiumDto } from './dto/create-condominium.dto';
import { UpdateCondominiumDto } from './dto/update-condominium.dto';

export type CondominiumListItem = {
  id: string;
  name: string;
  ownerId: string;
  /** Plano gravado no condomínio; `null` = até à alteração, usa regras de fallback (titular / padrão). */
  saasPlanId: number | null;
  /** Plano efectivo para faturação (após resolver titular / padrão). */
  billingPlanId: number;
  billingPlanName: string;
  billingPricePerUnitCents: number;
  createdAt: Date;
  updatedAt: Date;
  hasSyndic: boolean;
  /** Nome da pessoa (perfil); nunca e-mail. */
  syndicName: string | null;
};

@Injectable()
export class CondominiumsService {
  constructor(
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    @InjectRepository(CondominiumParticipant)
    private readonly participantRepo: Repository<CondominiumParticipant>,
    private readonly dataSource: DataSource,
    private readonly saasPlans: SaasPlansService,
  ) {}

  async assertOwner(
    condominiumId: string,
    userId: string,
  ): Promise<Condominium> {
    const condo = await this.condoRepo.findOne({
      where: { id: condominiumId, ownerId: userId },
    });
    if (!condo) {
      throw new ForbiddenException('Condominium not found or access denied');
    }
    return condo;
  }

  findAllForOwner(userId: string): Promise<CondominiumListItem[]> {
    return this.findAllAccessible(userId);
  }

  /** Titular da conta ou participante de gestão (síndico/admin/owner na tabela). */
  async findAllAccessible(userId: string): Promise<CondominiumListItem[]> {
    const byOwnerOrParticipant = await this.condoRepo
      .createQueryBuilder('c')
      .leftJoin(
        'condominium_participants',
        'p',
        'p.condominium_id = c.id AND p.user_id = :uid',
        { uid: userId },
      )
      .where('c.owner_id = :uid OR p.user_id IS NOT NULL', { uid: userId })
      .getMany();

    const byUnit = await this.condoRepo
      .createQueryBuilder('c')
      .innerJoin('groupings', 'g', 'g.condominium_id = c.id')
      .innerJoin('units', 'u', 'u.grouping_id = g.id')
      .leftJoin('people', 'op', 'op.id = u.owner_person_id')
      .leftJoin('people', 'rp', 'rp.id = u.responsible_person_id')
      .where('op.user_id = :uid OR rp.user_id = :uid', { uid: userId })
      .getMany();

    const map = new Map<string, Condominium>();
    for (const x of [...byOwnerOrParticipant, ...byUnit]) {
      map.set(x.id, x);
    }
    const sorted = Array.from(map.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return this.withSyndicNames(sorted);
  }

  private async withSyndicNames(
    condos: Condominium[],
  ): Promise<CondominiumListItem[]> {
    if (condos.length === 0) {
      return [];
    }
    const ids = condos.map((c) => c.id);
    const syndics = await this.participantRepo.find({
      where: { condominiumId: In(ids), role: GovernanceRole.Syndic },
      relations: ['person'],
    });
    const syndicByCondo = new Map<
      string,
      { hasSyndic: true; name: string | null }
    >();
    for (const s of syndics) {
      if (syndicByCondo.has(s.condominiumId)) {
        continue;
      }
      const personName = s.person?.fullName?.trim();
      const name =
        personName && personName.length > 0 ? personName : null;
      syndicByCondo.set(s.condominiumId, { hasSyndic: true, name });
    }

    const withPlans = await Promise.all(
      condos.map(async (c) => {
        const plan = await this.saasPlans.resolvePlanForCondominium(c);
        return { c, plan };
      }),
    );

    const unitByCondo = await this.saasPlans.countUnitsByCondominiumIds(ids);

    return withPlans.map(({ c, plan }): CondominiumListItem => ({
      id: c.id,
      name: c.name,
      ownerId: c.ownerId,
      saasPlanId: c.saasPlanId ?? null,
      billingPlanId: plan.id,
      billingPlanName: plan.name,
      billingPricePerUnitCents: this.saasPlans.effectivePricePerUnitCents(
        plan,
        unitByCondo.get(c.id) ?? 0,
      ),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      hasSyndic: syndicByCondo.has(c.id),
      syndicName: syndicByCondo.get(c.id)?.name ?? null,
    }));
  }

  async findOneAccessible(
    id: string,
    userId: string,
  ): Promise<CondominiumListItem> {
    const all = await this.findAllAccessible(userId);
    const c = all.find((x) => x.id === id);
    if (!c) {
      throw new NotFoundException('Condominium not found');
    }
    return c;
  }

  async findById(condominiumId: string): Promise<Condominium | null> {
    return this.condoRepo.findOne({ where: { id: condominiumId } });
  }

  /** Para jobs internos (ex.: fechamento mensal automático). */
  async findAllCondominiumIds(): Promise<string[]> {
    const rows = await this.condoRepo.find({ select: ['id'] });
    return rows.map((r) => r.id);
  }

  async findOneForOwner(id: string, userId: string): Promise<Condominium> {
    const condo = await this.condoRepo.findOne({
      where: { id, ownerId: userId },
    });
    if (!condo) {
      throw new NotFoundException('Condominium not found');
    }
    return condo;
  }

  async create(
    userId: string,
    dto: CreateCondominiumDto,
  ): Promise<Condominium> {
    return this.dataSource.transaction(async (manager) => {
      let saasPlanId: number;
      if (dto.planId != null) {
        const p = await this.saasPlans.getPlan(dto.planId);
        if (!p.active) {
          throw new BadRequestException('Este plano não está disponível.');
        }
        saasPlanId = p.id;
      } else {
        saasPlanId = await this.saasPlans.resolveDefaultPlanIdForNewUser();
      }

      const condo = manager.create(Condominium, {
        ownerId: userId,
        name: dto.name,
        saasPlanId,
      });
      await manager.save(condo);
      const grouping = manager.create(Grouping, {
        condominiumId: condo.id,
        name: 'Geral',
      });
      await manager.save(grouping);
      return condo;
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCondominiumDto,
  ): Promise<Condominium> {
    const condo = await this.findOneForOwner(id, userId);
    if (dto.name !== undefined) {
      condo.name = dto.name;
    }
    if (dto.planId !== undefined) {
      const p = await this.saasPlans.getPlan(dto.planId);
      if (!p.active) {
        throw new BadRequestException('Este plano não está disponível.');
      }
      condo.saasPlanId = p.id;
    }
    return this.condoRepo.save(condo);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOneForOwner(id, userId);
    await this.condoRepo.delete(id);
  }
}
