import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';
import { Unit } from '../units/unit.entity';
import { FundAccrualService } from './fund-accrual.service';
import {
  dueDateForCompetenceYm,
  firstDayOfCompetenceYm,
  isValidCompetenceYm,
  lastDayOfCompetenceYm,
} from './finance-competence.util';

export interface CondominiumFeeChargeView {
  id: string;
  competenceYm: string;
  unitId: string;
  unitIdentifier: string;
  groupingName: string;
  amountDueCents: string;
  dueOn: string;
  status: 'open' | 'paid';
  paidAt: string | null;
  incomeTransactionId: string | null;
}

@Injectable()
export class CondominiumFeesService {
  constructor(
    @InjectRepository(CondominiumFeeCharge)
    private readonly chargeRepo: Repository<CondominiumFeeCharge>,
    @InjectRepository(TransactionUnitShare)
    private readonly shareRepo: Repository<TransactionUnitShare>,
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    private readonly condominiumsService: CondominiumsService,
    private readonly fundAccrual: FundAccrualService,
  ) {}

  async listCharges(
    condominiumId: string,
    userId: string,
    competenceYm: string,
  ): Promise<CondominiumFeeChargeView[]> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    if (!competenceYm?.trim()) {
      throw new BadRequestException('competenceYm query is required');
    }
    const ym = competenceYm.trim();
    this.assertYm(ym);

    const rows = await this.chargeRepo
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.unit', 'u')
      .innerJoinAndSelect('u.grouping', 'g')
      .where('c.condominium_id = :cid', { cid: condominiumId })
      .andWhere('c.competence_ym = :ym', { ym })
      .orderBy('g.name', 'ASC')
      .addOrderBy('u.identifier', 'ASC')
      .getMany();

    return rows.map((c) => this.toView(c));
  }

  async closeMonth(
    condominiumId: string,
    userId: string,
    competenceYm: string,
  ): Promise<CondominiumFeeChargeView[]> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    this.assertYm(competenceYm);
    await this.closeMonthInternal(condominiumId, competenceYm);
    return this.listCharges(condominiumId, userId, competenceYm);
  }

  /** Usado pelo cron (sem utilizador). */
  async closeMonthInternal(
    condominiumId: string,
    competenceYm: string,
  ): Promise<void> {
    this.assertYm(competenceYm);
    await this.fundAccrual.ensureAccrualsForCompetence(
      condominiumId,
      competenceYm,
    );
    const rawByUnit = await this.sumSharesByUnit(condominiumId, competenceYm);
    const unitsInGroups = await this.getUnitsWithGrouping(condominiumId);
    const billedByUnit = this.equalizeAmountPerGrouping(rawByUnit, unitsInGroups);
    const dueOn = dueDateForCompetenceYm(competenceYm);

    for (const { unitId } of unitsInGroups) {
      const existing = await this.chargeRepo.findOne({
        where: {
          condominiumId,
          competenceYm,
          unitId,
        },
      });
      if (existing?.status === 'paid') {
        continue;
      }
      const amountDue = billedByUnit.get(unitId) ?? 0n;
      if (existing) {
        existing.amountDueCents = amountDue.toString();
        existing.dueOn = dueOn;
        await this.chargeRepo.save(existing);
      } else {
        await this.chargeRepo.save(
          this.chargeRepo.create({
            condominiumId,
            competenceYm,
            unitId,
            amountDueCents: amountDue.toString(),
            dueOn,
            status: 'open',
            paidAt: null,
            incomeTransactionId: null,
          }),
        );
      }
    }
  }

  async regenerateMonth(
    condominiumId: string,
    userId: string,
    competenceYm: string,
  ): Promise<CondominiumFeeChargeView[]> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    this.assertYm(competenceYm);

    const paidCount = await this.chargeRepo.count({
      where: {
        condominiumId,
        competenceYm,
        status: 'paid',
      },
    });
    if (paidCount > 0) {
      throw new BadRequestException(
        'Cannot regenerate: there are paid charges for this month. Unlink payments first.',
      );
    }

    await this.chargeRepo.delete({ condominiumId, competenceYm });
    await this.fundAccrual.ensureAccrualsForCompetence(
      condominiumId,
      competenceYm,
    );
    const rawByUnit = await this.sumSharesByUnit(condominiumId, competenceYm);
    const unitsInGroups = await this.getUnitsWithGrouping(condominiumId);
    const billedByUnit = this.equalizeAmountPerGrouping(rawByUnit, unitsInGroups);
    const dueOn = dueDateForCompetenceYm(competenceYm);

    for (const { unitId } of unitsInGroups) {
      const amountDue = billedByUnit.get(unitId) ?? 0n;
      await this.chargeRepo.save(
        this.chargeRepo.create({
          condominiumId,
          competenceYm,
          unitId,
          amountDueCents: amountDue.toString(),
          dueOn,
          status: 'open',
          paidAt: null,
          incomeTransactionId: null,
        }),
      );
    }

    return this.listCharges(condominiumId, userId, competenceYm);
  }

  async settle(
    condominiumId: string,
    userId: string,
    chargeId: string,
    incomeTransactionId: string,
  ): Promise<CondominiumFeeChargeView> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const charge = await this.chargeRepo.findOne({
      where: { id: chargeId, condominiumId },
      relations: { unit: { grouping: true } },
    });
    if (!charge) {
      throw new NotFoundException('Charge not found');
    }
    if (charge.status !== 'open') {
      throw new BadRequestException('Charge is not open');
    }

    const tx = await this.txRepo.findOne({
      where: { id: incomeTransactionId, condominiumId },
      relations: { unitShares: true },
    });
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }
    if (tx.kind !== 'income') {
      throw new BadRequestException('Transaction must be income');
    }
    const share = tx.unitShares?.find((s) => s.unitId === charge.unitId);
    if (!share) {
      throw new BadRequestException(
        'Income transaction has no allocation for this unit',
      );
    }
    const shareAbs = -BigInt(share.shareCents);
    const due = BigInt(charge.amountDueCents);
    if (shareAbs !== due) {
      throw new BadRequestException(
        'Income amount allocated to this unit does not match charge',
      );
    }

    charge.status = 'paid';
    charge.incomeTransactionId = tx.id;
    charge.paidAt =
      tx.occurredOn instanceof Date
        ? tx.occurredOn
        : new Date(String(tx.occurredOn));
    await this.chargeRepo.save(charge);
    return this.toView(charge);
  }

  private toView(c: CondominiumFeeCharge): CondominiumFeeChargeView {
    const u = c.unit;
    const due =
      c.dueOn instanceof Date
        ? c.dueOn.toISOString().slice(0, 10)
        : String(c.dueOn).slice(0, 10);
    const paid =
      c.paidAt == null
        ? null
        : c.paidAt instanceof Date
          ? c.paidAt.toISOString().slice(0, 10)
          : String(c.paidAt).slice(0, 10);
    return {
      id: c.id,
      competenceYm: c.competenceYm,
      unitId: c.unitId,
      unitIdentifier: u?.identifier ?? '',
      groupingName: u?.grouping?.name ?? '',
      amountDueCents: String(c.amountDueCents),
      dueOn: due,
      status: c.status,
      paidAt: paid,
      incomeTransactionId: c.incomeTransactionId,
    };
  }

  private assertYm(ym: string): void {
    if (!isValidCompetenceYm(ym)) {
      throw new BadRequestException('Invalid competenceYm');
    }
  }

  private async getUnitsWithGrouping(
    condominiumId: string,
  ): Promise<Array<{ unitId: string; groupingId: string }>> {
    const rows = await this.unitRepo
      .createQueryBuilder('u')
      .innerJoin('u.grouping', 'g')
      .where('g.condominium_id = :cid', { cid: condominiumId })
      .select('u.id', 'unitId')
      .addSelect('g.id', 'groupingId')
      .getRawMany<{ unitId: string; groupingId: string }>();
    return rows;
  }

  /**
   * Por agrupamento, todas as unidades passam a ter o mesmo valor devido:
   * o **máximo** das cotas líquidas brutas entre unidades daquele grupo.
   * Assim, diferenças de 1 centavo por repartição de restos ficam niveladas
   * para cima (prefere-se arrecadar um pouco mais).
   */
  private equalizeAmountPerGrouping(
    rawByUnit: Map<string, bigint>,
    units: Array<{ unitId: string; groupingId: string }>,
  ): Map<string, bigint> {
    const rawsByGrouping = new Map<string, bigint[]>();
    for (const { unitId, groupingId } of units) {
      const raw = rawByUnit.get(unitId) ?? 0n;
      const list = rawsByGrouping.get(groupingId) ?? [];
      list.push(raw);
      rawsByGrouping.set(groupingId, list);
    }
    const amountForGrouping = new Map<string, bigint>();
    for (const [groupingId, arr] of rawsByGrouping) {
      let max = arr[0]!;
      for (let i = 1; i < arr.length; i++) {
        const v = arr[i]!;
        if (v > max) {
          max = v;
        }
      }
      amountForGrouping.set(groupingId, max);
    }
    const out = new Map<string, bigint>();
    for (const { unitId, groupingId } of units) {
      out.set(unitId, amountForGrouping.get(groupingId)!);
    }
    return out;
  }

  private async sumSharesByUnit(
    condominiumId: string,
    competenceYm: string,
  ): Promise<Map<string, bigint>> {
    const from = firstDayOfCompetenceYm(competenceYm);
    const to = lastDayOfCompetenceYm(competenceYm);
    const raw = await this.shareRepo
      .createQueryBuilder('s')
      .innerJoin('s.transaction', 't')
      .where('t.condominium_id = :cid', { cid: condominiumId })
      .andWhere('t.occurred_on >= :from', { from })
      .andWhere('t.occurred_on <= :to', { to })
      .select('s.unit_id', 'unitId')
      .addSelect('SUM(s.share_cents)', 'sumCents')
      .groupBy('s.unit_id')
      .getRawMany<{ unitId: string; sumCents: string | null }>();

    const map = new Map<string, bigint>();
    for (const r of raw) {
      const v = r.sumCents ?? '0';
      map.set(r.unitId, BigInt(String(v)));
    }
    return map;
  }
}
