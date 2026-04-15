import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { Unit } from '../units/unit.entity';
import { User } from '../users/user.entity';
import type { CreateSaasPlanDto } from './dto/create-saas-plan.dto';
import type { PatchSaasPlanDto } from './dto/patch-saas-plan.dto';
import { SaasPlan } from './entities/saas-plan.entity';
import {
  assertValidUnitPriceTiers,
  normalizeTiersFromInput,
  resolvePricePerUnitForUnitCount,
  type SaasPlanPriceTier,
} from './saas-plan-unit-pricing';
import { SaasVoucherService } from './saas-voucher.service';

@Injectable()
export class SaasPlansService {
  constructor(
    @InjectRepository(SaasPlan)
    private readonly planRepo: Repository<SaasPlan>,
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    private readonly dataSource: DataSource,
    private readonly vouchers: SaasVoucherService,
  ) {}

  async listPlans(): Promise<SaasPlan[]> {
    return this.planRepo.find({ order: { id: 'ASC' } });
  }

  /** Catálogo público: só planos activos (sem `notes` internas). */
  async listPublicCatalog(): Promise<
    Array<{
      id: number;
      name: string;
      pricePerUnitCents: number;
      unitPriceTiers: SaasPlanPriceTier[] | null;
      currency: string;
      isDefault: boolean;
      catalogBlurb: string | null;
    }>
  > {
    const rows = await this.planRepo.find({
      where: { active: true },
      order: { isDefault: 'DESC', id: 'ASC' },
      select: {
        id: true,
        name: true,
        pricePerUnitCents: true,
        unitPriceTiers: true,
        currency: true,
        isDefault: true,
        catalogBlurb: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      pricePerUnitCents: r.pricePerUnitCents,
      unitPriceTiers: r.unitPriceTiers ?? null,
      currency: r.currency,
      isDefault: r.isDefault,
      catalogBlurb: r.catalogBlurb ?? null,
    }));
  }

  async getPlan(id: number): Promise<SaasPlan> {
    const p = await this.planRepo.findOne({ where: { id } });
    if (!p) {
      throw new NotFoundException('Plano não encontrado.');
    }
    return p;
  }

  async createPlan(dto: CreateSaasPlanDto): Promise<SaasPlan> {
    let tiers: SaasPlanPriceTier[] | null = null;
    if (dto.unitPriceTiers != null && dto.unitPriceTiers.length > 0) {
      tiers = normalizeTiersFromInput(dto.unitPriceTiers);
      assertValidUnitPriceTiers(tiers);
    }
    const pricePerUnitCents = tiers?.length
      ? tiers[0].pricePerUnitCents
      : dto.pricePerUnitCents;
    const row = this.planRepo.create({
      name: dto.name.trim(),
      pricePerUnitCents,
      unitPriceTiers: tiers,
      currency: (dto.currency ?? 'BRL').toUpperCase(),
      active: dto.active ?? true,
      notes: dto.notes ?? null,
      catalogBlurb: dto.catalogBlurb?.trim() ? dto.catalogBlurb.trim() : null,
      isDefault: false,
    });
    return this.planRepo.save(row);
  }

  async patchPlan(id: number, dto: PatchSaasPlanDto): Promise<SaasPlan> {
    const row = await this.getPlan(id);

    if (dto.unitPriceTiers !== undefined) {
      if (dto.unitPriceTiers === null || dto.unitPriceTiers.length === 0) {
        row.unitPriceTiers = null;
      } else {
        const tiers = normalizeTiersFromInput(dto.unitPriceTiers);
        assertValidUnitPriceTiers(tiers);
        row.unitPriceTiers = tiers;
        row.pricePerUnitCents = tiers[0].pricePerUnitCents;
      }
    }

    if (dto.pricePerUnitCents !== undefined) {
      const stillHasTiers =
        row.unitPriceTiers != null && row.unitPriceTiers.length > 0;
      if (stillHasTiers) {
        throw new BadRequestException(
          'Este plano usa faixas de unidades. Atualize `unitPriceTiers` ou remova-as (`unitPriceTiers: null`) antes de alterar só `pricePerUnitCents`.',
        );
      }
      row.pricePerUnitCents = dto.pricePerUnitCents;
    }

    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }
    if (dto.currency !== undefined) {
      row.currency = dto.currency.toUpperCase();
    }
    if (dto.active !== undefined) {
      row.active = dto.active;
    }
    if (dto.notes !== undefined) {
      row.notes = dto.notes;
    }
    if (dto.catalogBlurb !== undefined) {
      row.catalogBlurb = dto.catalogBlurb?.trim()
        ? dto.catalogBlurb.trim()
        : null;
    }
    return this.planRepo.save(row);
  }

  /**
   * Preço por unidade efectivo para faturação (faixas ou preço único).
   * `unitCount < 1` usa a faixa de 1 unidade só para consultar a tarifa.
   */
  effectivePricePerUnitCents(plan: SaasPlan, unitCount: number): number {
    return resolvePricePerUnitForUnitCount(
      plan.pricePerUnitCents,
      plan.unitPriceTiers,
      unitCount,
    );
  }

  /** Contagem de unidades por condomínio (uma query). */
  async countUnitsByCondominiumIds(
    condominiumIds: string[],
  ): Promise<Map<string, number>> {
    if (condominiumIds.length === 0) {
      return new Map();
    }
    const raw = await this.unitRepo
      .createQueryBuilder('u')
      .innerJoin('u.grouping', 'g')
      .select('g.condominium_id', 'cid')
      .addSelect('COUNT(u.id)', 'cnt')
      .where('g.condominium_id IN (:...ids)', { ids: condominiumIds })
      .groupBy('g.condominium_id')
      .getRawMany();
    const m = new Map<string, number>();
    for (const r of raw) {
      m.set(String(r.cid), Number(r.cnt));
    }
    return m;
  }

  /**
   * Define o plano padrão para novos registos. Garante um único `is_default`.
   */
  async setDefaultPlan(id: number): Promise<SaasPlan> {
    await this.getPlan(id);
    await this.dataSource.transaction(async (em) => {
      await em
        .createQueryBuilder()
        .update(SaasPlan)
        .set({ isDefault: false })
        .execute();
      await em
        .createQueryBuilder()
        .update(SaasPlan)
        .set({ isDefault: true })
        .where('id = :id', { id })
        .execute();
    });
    return this.getPlan(id);
  }

  async getDefaultPlan(): Promise<SaasPlan> {
    const p = await this.planRepo.findOne({ where: { isDefault: true } });
    if (!p) {
      throw new BadRequestException(
        'Não existe plano marcado como padrão. Defina um em Plataforma → Planos.',
      );
    }
    return p;
  }

  /** Para novos utilizadores no registo. */
  async resolveDefaultPlanIdForNewUser(): Promise<number> {
    const p = await this.getDefaultPlan();
    return p.id;
  }

  async countUnitsForCondominium(condominiumId: string): Promise<number> {
    return this.unitRepo
      .createQueryBuilder('u')
      .innerJoin('u.grouping', 'g')
      .where('g.condominiumId = :cid', { cid: condominiumId })
      .getCount();
  }

  /**
   * Plano efectivo do titular do condomínio, ou plano padrão da plataforma.
   */
  async resolvePlanForCondominiumOwner(ownerId: string): Promise<SaasPlan> {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: ownerId },
      relations: { plan: true },
    });
    if (user?.planId && user.plan && user.plan.active) {
      return user.plan;
    }
    if (user?.planId) {
      const p = await this.planRepo.findOne({ where: { id: user.planId } });
      if (p?.active) {
        return p;
      }
    }
    return this.getDefaultPlan();
  }

  /** Plano do condomínio se definido e activo; senão plano do titular / padrão. */
  async resolvePlanForCondominium(condo: Condominium): Promise<SaasPlan> {
    if (condo.saasPlanId != null) {
      const linked = condo.saasPlan;
      if (linked?.active) {
        return linked;
      }
      const p = await this.planRepo.findOne({ where: { id: condo.saasPlanId } });
      if (p?.active) {
        return p;
      }
    }
    return this.resolvePlanForCondominiumOwner(condo.ownerId);
  }

  async computeCondominiumPlanPricing(
    condominiumId: string,
    referenceMonth?: string,
  ): Promise<{
    condominiumId: string;
    unitCount: number;
    planId: number;
    planName: string;
    pricePerUnitCents: number;
    baseMonthlyCents: number;
    discountPercent: number;
    appliedVoucherIds: string[];
    appliedLabels: string[];
    monthlyCents: number;
    currency: string;
    referenceMonth: string;
  }> {
    const condo = await this.condoRepo.findOne({
      where: { id: condominiumId },
      relations: { saasPlan: true },
    });
    if (!condo) {
      throw new NotFoundException('Condomínio não encontrado.');
    }
    const unitCount = await this.countUnitsForCondominium(condominiumId);
    const plan = await this.resolvePlanForCondominium(condo);
    const unitPrice = this.effectivePricePerUnitCents(plan, unitCount);
    const baseMonthlyCents = unitPrice * unitCount;
    const ref =
      referenceMonth?.trim() || new Date().toISOString().slice(0, 7);
    const v = await this.vouchers.getApplicableDiscountForCondominium(
      condominiumId,
      ref,
    );
    const monthlyCents = Math.floor(
      (baseMonthlyCents * (100 - v.discountPercent)) / 100,
    );
    return {
      condominiumId,
      unitCount,
      planId: plan.id,
      planName: plan.name,
      pricePerUnitCents: unitPrice,
      baseMonthlyCents,
      discountPercent: v.discountPercent,
      appliedVoucherIds: v.appliedVoucherIds,
      appliedLabels: v.appliedLabels,
      monthlyCents,
      currency: plan.currency,
      referenceMonth: ref,
    };
  }
}
