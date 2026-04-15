import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { User } from '../users/user.entity';
import type { PatchSaasBillingDto } from './dto/patch-saas-billing.dto';
import { SaasCharge } from './entities/saas-charge.entity';
import { SaasCondominiumBilling } from './entities/saas-condominium-billing.entity';
import {
  DEFAULT_SAAS_BILLING_TZ,
  dueDayOfMonthFromDate,
} from './saas-billing-cycle.util';

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    @InjectRepository(SaasCondominiumBilling)
    private readonly billingRepo: Repository<SaasCondominiumBilling>,
    @InjectRepository(SaasCharge)
    private readonly chargeRepo: Repository<SaasCharge>,
  ) {}

  async getMe(userId: string): Promise<{ email: string; platformAdmin: true }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    return { email: user.email, platformAdmin: true };
  }

  async listUsers(page: number, limit: number): Promise<{
    items: Array<{
      id: string;
      email: string;
      phone: string | null;
      createdAt: Date;
      condominiumCount: number;
      planId: number | null;
      planName: string | null;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    const [users, total] = await this.usersRepo.findAndCount({
      relations: { plan: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    const ownerIds = users.map((u) => u.id);
    const countRows =
      ownerIds.length === 0
        ? []
        : await this.condoRepo
            .createQueryBuilder('c')
            .select('c.owner_id', 'ownerId')
            .addSelect('COUNT(*)', 'cnt')
            .where('c.owner_id IN (:...ids)', { ids: ownerIds })
            .groupBy('c.owner_id')
            .getRawMany<{ ownerId: string; cnt: string }>();
    const countMap = new Map(
      countRows.map((r) => [r.ownerId, Number(r.cnt)]),
    );
    return {
      items: users.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt,
        condominiumCount: countMap.get(u.id) ?? 0,
        planId: u.planId,
        planName: u.plan?.name ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  async listCondominiums(page: number, limit: number): Promise<{
    items: Array<{
      id: string;
      name: string;
      ownerId: string;
      ownerEmail: string;
      createdAt: Date;
      updatedAt: Date;
      billing: {
        monthlyAmountCents: number;
        currency: string;
        status: string;
      } | null;
      lastCharge: {
        referenceMonth: string;
        status: string;
        dueDate: string;
      } | null;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    const [rows, total] = await this.condoRepo.findAndCount({
      relations: { owner: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    const ids = rows.map((c) => c.id);
    const billingMap = new Map<string, SaasCondominiumBilling>();
    const latestChargeMap = new Map<string, SaasCharge>();
    if (ids.length > 0) {
      const billings = await this.billingRepo.find({
        where: { condominiumId: In(ids) },
      });
      for (const b of billings) {
        billingMap.set(b.condominiumId, b);
      }
      const charges = await this.chargeRepo.find({
        where: { condominiumId: In(ids) },
        order: { createdAt: 'DESC' },
      });
      for (const ch of charges) {
        if (!latestChargeMap.has(ch.condominiumId)) {
          latestChargeMap.set(ch.condominiumId, ch);
        }
      }
    }
    return {
      items: rows.map((c) => {
        const b = billingMap.get(c.id) ?? null;
        const last = latestChargeMap.get(c.id) ?? null;
        return {
          id: c.id,
          name: c.name,
          ownerId: c.ownerId,
          ownerEmail: c.owner.email,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          billing: b
            ? {
                monthlyAmountCents: b.monthlyAmountCents,
                currency: b.currency,
                status: b.status,
              }
            : null,
          lastCharge: last
            ? {
                referenceMonth: last.referenceMonth,
                status: last.status,
                dueDate: last.dueDate,
              }
            : null,
        };
      }),
      total,
      page,
      limit,
    };
  }

  private async requireCondominium(condoId: string): Promise<Condominium> {
    const c = await this.condoRepo.findOne({ where: { id: condoId } });
    if (!c) {
      throw new NotFoundException('Condomínio não encontrado.');
    }
    return c;
  }

  async getBilling(condoId: string): Promise<{
    condominiumId: string;
    monthlyAmountCents: number;
    currency: string;
    asaasCustomerId: string | null;
    status: string;
    billingDueDay: number;
    notes: string | null;
    updatedAt: Date;
  } | null> {
    await this.requireCondominium(condoId);
    const row = await this.billingRepo.findOne({
      where: { condominiumId: condoId },
    });
    if (!row) {
      return null;
    }
    return {
      condominiumId: row.condominiumId,
      monthlyAmountCents: row.monthlyAmountCents,
      currency: row.currency,
      asaasCustomerId: row.asaasCustomerId,
      status: row.status,
      billingDueDay: row.billingDueDay,
      notes: row.notes,
      updatedAt: row.updatedAt,
    };
  }

  async patchBilling(condoId: string, dto: PatchSaasBillingDto): Promise<{
    condominiumId: string;
    monthlyAmountCents: number;
    currency: string;
    asaasCustomerId: string | null;
    status: string;
    billingDueDay: number;
    notes: string | null;
    updatedAt: Date;
  }> {
    const condo = await this.requireCondominium(condoId);
    let row = await this.billingRepo.findOne({
      where: { condominiumId: condoId },
    });
    if (!row) {
      row = this.billingRepo.create({
        condominiumId: condoId,
        monthlyAmountCents: dto.monthlyAmountCents ?? 0,
        currency: (dto.currency ?? 'BRL').toUpperCase(),
        status: dto.status ?? 'active',
        billingDueDay:
          dto.billingDueDay ??
          dueDayOfMonthFromDate(condo.createdAt, DEFAULT_SAAS_BILLING_TZ),
        notes: dto.notes ?? null,
      });
    } else {
      if (dto.monthlyAmountCents !== undefined) {
        row.monthlyAmountCents = dto.monthlyAmountCents;
      }
      if (dto.currency !== undefined) {
        row.currency = dto.currency.toUpperCase();
      }
      if (dto.status !== undefined) {
        row.status = dto.status;
      }
      if (dto.billingDueDay !== undefined) {
        row.billingDueDay = dto.billingDueDay;
      }
      if (dto.notes !== undefined) {
        row.notes = dto.notes;
      }
    }
    await this.billingRepo.save(row);
    return {
      condominiumId: row.condominiumId,
      monthlyAmountCents: row.monthlyAmountCents,
      currency: row.currency,
      asaasCustomerId: row.asaasCustomerId,
      status: row.status,
      billingDueDay: row.billingDueDay,
      notes: row.notes,
      updatedAt: row.updatedAt,
    };
  }

  async listCharges(condoId: string): Promise<SaasCharge[]> {
    await this.requireCondominium(condoId);
    return this.chargeRepo.find({
      where: { condominiumId: condoId },
      order: { referenceMonth: 'DESC' },
    });
  }

  /** Usado pelo fluxo Asaas (webhook / criação de cobrança). */
  getBillingRow(condoId: string): Promise<SaasCondominiumBilling | null> {
    return this.billingRepo.findOne({ where: { condominiumId: condoId } });
  }

  getChargeById(id: string): Promise<SaasCharge | null> {
    return this.chargeRepo.findOne({ where: { id } });
  }

  saveCharge(charge: SaasCharge): Promise<SaasCharge> {
    return this.chargeRepo.save(charge);
  }

  saveBilling(billing: SaasCondominiumBilling): Promise<SaasCondominiumBilling> {
    return this.billingRepo.save(billing);
  }
}
