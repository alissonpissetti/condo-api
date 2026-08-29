import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { GovernanceService } from '../planning/governance.service';
import { GovernanceRole } from '../planning/enums/governance-role.enum';
import type { CondoAccess } from '../planning/governance.service';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { Unit } from '../units/unit.entity';
import { CondominiumBankAccount } from './entities/condominium-bank-account.entity';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
import { UnitFeeCreditEntry } from './entities/unit-fee-credit-entry.entity';
import {
  allocateUnitCreditFifo,
  netDueAfterCredit,
  type OpenChargeForCredit,
} from './unit-fee-credit.util';

export interface UnitFeeCreditEntryView {
  id: string;
  unitId: string;
  signedAmountCents: string;
  entryKind: UnitFeeCreditEntry['entryKind'];
  justification: string | null;
  hasPaymentReceipt: boolean;
  bankAccountId: string | null;
  chargeId: string | null;
  actorUserId: string;
  createdAt: string;
}

export interface UnitFeeCreditBalanceView {
  unitId: string;
  unitIdentifier: string;
  groupingName: string;
  balanceCents: string;
}

export type ChargeCreditEnrichment = {
  unitCreditBalanceCents: string;
  creditAppliedCents: string;
  netDueCents: string;
};

@Injectable()
export class UnitFeeCreditService {
  constructor(
    @InjectRepository(UnitFeeCreditEntry)
    private readonly entryRepo: Repository<UnitFeeCreditEntry>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(CondominiumFeeCharge)
    private readonly chargeRepo: Repository<CondominiumFeeCharge>,
    @InjectRepository(CondominiumBankAccount)
    private readonly bankAccountRepo: Repository<CondominiumBankAccount>,
    private readonly governance: GovernanceService,
    @Inject(RECEIPT_STORAGE) private readonly storage: ReceiptStoragePort,
  ) {}

  async registerAdvancePayment(
    condominiumId: string,
    userId: string,
    dto: {
      unitId: string;
      amountCents: number;
      justification: string;
      bankAccountId?: string;
      paymentReceiptStorageKey?: string;
    },
  ): Promise<UnitFeeCreditEntryView> {
    await this.governance.assertManagement(condominiumId, userId);
    const unitId = dto.unitId.trim();
    const amount = BigInt(Math.trunc(dto.amountCents));
    if (amount <= 0n) {
      throw new BadRequestException('amountCents must be positive');
    }
    const justification = dto.justification.trim();
    if (justification.length < 8) {
      throw new BadRequestException('justification is too short');
    }

    const unit = await this.unitRepo.findOne({
      where: { id: unitId, grouping: { condominiumId } },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    const receiptKey = dto.paymentReceiptStorageKey?.trim() || null;
    if (receiptKey) {
      await this.storage.assertReceiptExists(condominiumId, receiptKey);
    }

    const bankAccountId = dto.bankAccountId?.trim() || null;
    if (bankAccountId) {
      const bank = await this.bankAccountRepo.findOne({
        where: { id: bankAccountId, condominiumId },
      });
      if (!bank) {
        throw new NotFoundException('Bank account not found');
      }
    }

    const saved = await this.entryRepo.save(
      this.entryRepo.create({
        condominiumId,
        unitId,
        signedAmountCents: amount.toString(),
        entryKind: 'advance_payment',
        justification,
        paymentReceiptStorageKey: receiptKey,
        bankAccountId,
        chargeId: null,
        actorUserId: userId,
      }),
    );
    return this.toView(saved);
  }

  async registerCreditFromExpenseSettledByUnit(
    mgr: EntityManager,
    params: {
      condominiumId: string;
      userId: string;
      unitId: string;
      amountCents: bigint;
      transactionId: string;
      transactionTitle: string;
      bankAccountId: string | null;
      paymentReceiptStorageKey: string | null;
    },
  ): Promise<void> {
    const unitId = params.unitId.trim();
    const transactionId = params.transactionId.trim();
    if (params.amountCents <= 0n) {
      throw new BadRequestException('amountCents must be positive');
    }

    const unit = await mgr.getRepository(Unit).findOne({
      where: { id: unitId, grouping: { condominiumId: params.condominiumId } },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    const existing = await mgr.count(UnitFeeCreditEntry, {
      where: {
        condominiumId: params.condominiumId,
        financialTransactionId: transactionId,
        entryKind: 'expense_paid_by_unit',
      },
    });
    if (existing > 0) {
      throw new BadRequestException(
        'Unit credit already registered for this transaction',
      );
    }

    const title = params.transactionTitle.trim() || 'despesa';
    const justification = `Pagamento da despesa «${title}» adiantado pela unidade. O condomínio deve repor o valor nas próximas taxas condominiais.`;

    await mgr.save(
      mgr.create(UnitFeeCreditEntry, {
        condominiumId: params.condominiumId,
        unitId,
        signedAmountCents: params.amountCents.toString(),
        entryKind: 'expense_paid_by_unit',
        justification,
        paymentReceiptStorageKey: params.paymentReceiptStorageKey,
        bankAccountId: params.bankAccountId,
        chargeId: null,
        financialTransactionId: transactionId,
        actorUserId: params.userId,
      }),
    );
  }

  async restoreCreditOnTransactionReopen(
    mgr: EntityManager,
    condominiumId: string,
    userId: string,
    transactionId: string,
  ): Promise<void> {
    const credited = await mgr.find(UnitFeeCreditEntry, {
      where: {
        condominiumId,
        financialTransactionId: transactionId,
        entryKind: 'expense_paid_by_unit',
      },
    });
    for (const row of credited) {
      const amount = BigInt(String(row.signedAmountCents));
      if (amount <= 0n) {
        continue;
      }
      await mgr.save(
        mgr.create(UnitFeeCreditEntry, {
          condominiumId,
          unitId: row.unitId,
          signedAmountCents: (-amount).toString(),
          entryKind: 'expense_paid_by_unit_reversed',
          justification: null,
          paymentReceiptStorageKey: null,
          bankAccountId: null,
          chargeId: null,
          financialTransactionId: transactionId,
          actorUserId: userId,
        }),
      );
    }
  }

  async getUnitBalanceCents(
    condominiumId: string,
    unitId: string,
  ): Promise<bigint> {
    const row = await this.entryRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.signed_amount_cents), 0)', 'sum')
      .where('e.condominium_id = :cid', { cid: condominiumId })
      .andWhere('e.unit_id = :uid', { uid: unitId })
      .getRawOne<{ sum: string }>();
    return BigInt(String(row?.sum ?? '0'));
  }

  async getBalancesForUnits(
    condominiumId: string,
    unitIds: string[],
  ): Promise<Map<string, bigint>> {
    const map = new Map<string, bigint>();
    if (unitIds.length === 0) {
      return map;
    }
    const rows = await this.entryRepo
      .createQueryBuilder('e')
      .select('e.unit_id', 'unitId')
      .addSelect('COALESCE(SUM(e.signed_amount_cents), 0)', 'sum')
      .where('e.condominium_id = :cid', { cid: condominiumId })
      .andWhere('e.unit_id IN (:...uids)', { uids: unitIds })
      .groupBy('e.unit_id')
      .getRawMany<{ unitId: string; sum: string }>();
    for (const id of unitIds) {
      map.set(id, 0n);
    }
    for (const r of rows) {
      map.set(r.unitId, BigInt(String(r.sum ?? '0')));
    }
    return map;
  }

  async listUnitsWithPositiveCreditBalance(
    condominiumId: string,
    userId: string,
  ): Promise<UnitFeeCreditBalanceView[]> {
    const access = await this.governance.assertAnyAccess(condominiumId, userId);
    let allowedUnitIds: string[] | null = null;
    if (!this.seesAllFeeCharges(access)) {
      allowedUnitIds = await this.governance.listUnitIdsLinkedToUser(
        condominiumId,
        userId,
      );
      if (allowedUnitIds.length === 0) {
        return [];
      }
    }

    const qb = this.entryRepo
      .createQueryBuilder('e')
      .innerJoin('e.unit', 'u')
      .innerJoin('u.grouping', 'g')
      .select('e.unit_id', 'unitId')
      .addSelect('u.identifier', 'unitIdentifier')
      .addSelect('g.name', 'groupingName')
      .addSelect('COALESCE(SUM(e.signed_amount_cents), 0)', 'balanceCents')
      .where('e.condominium_id = :cid', { cid: condominiumId })
      .groupBy('e.unit_id')
      .addGroupBy('u.identifier')
      .addGroupBy('g.name')
      .having('COALESCE(SUM(e.signed_amount_cents), 0) > 0')
      .orderBy('g.name', 'ASC')
      .addOrderBy('u.identifier', 'ASC');

    if (allowedUnitIds !== null) {
      qb.andWhere('e.unit_id IN (:...uids)', { uids: allowedUnitIds });
    }

    const rows = await qb.getRawMany<{
      unitId: string;
      unitIdentifier: string;
      groupingName: string;
      balanceCents: string;
    }>();

    return rows.map((r) => ({
      unitId: r.unitId,
      unitIdentifier: String(r.unitIdentifier ?? '').trim() || '—',
      groupingName: String(r.groupingName ?? '').trim() || '—',
      balanceCents: String(r.balanceCents ?? '0'),
    }));
  }

  async listUnitCreditHistory(
    condominiumId: string,
    userId: string,
    unitId: string,
  ): Promise<{ balanceCents: string; entries: UnitFeeCreditEntryView[] }> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const unit = await this.unitRepo.findOne({
      where: { id: unitId, grouping: { condominiumId } },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    const entries = await this.entryRepo.find({
      where: { condominiumId, unitId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const balance = await this.getUnitBalanceCents(condominiumId, unitId);
    return {
      balanceCents: balance.toString(),
      entries: entries.map((e) => this.toView(e)),
    };
  }

  async loadOpenChargesByUnit(
    condominiumId: string,
    unitIds: string[],
  ): Promise<Map<string, OpenChargeForCredit[]>> {
    const map = new Map<string, OpenChargeForCredit[]>();
    if (unitIds.length === 0) {
      return map;
    }
    const rows = await this.chargeRepo.find({
      where: { condominiumId, unitId: In(unitIds), status: 'open' },
      order: { competenceYm: 'ASC' },
    });
    for (const id of unitIds) {
      map.set(id, []);
    }
    for (const c of rows) {
      const list = map.get(c.unitId) ?? [];
      list.push({
        id: c.id,
        competenceYm: c.competenceYm,
        amountDueCents: String(c.amountDueCents),
      });
      map.set(c.unitId, list);
    }
    return map;
  }

  buildChargeCreditEnrichment(
    charge: Pick<CondominiumFeeCharge, 'id' | 'unitId' | 'amountDueCents' | 'status'>,
    unitBalance: bigint,
    openChargesForUnit: OpenChargeForCredit[],
  ): ChargeCreditEnrichment {
    const balanceStr = unitBalance.toString();
    if (charge.status !== 'open') {
      return {
        unitCreditBalanceCents: balanceStr,
        creditAppliedCents: '0',
        netDueCents: '0',
      };
    }
    const alloc = allocateUnitCreditFifo(openChargesForUnit, unitBalance);
    const applied = alloc.get(charge.id) ?? 0n;
    const net = netDueAfterCredit(BigInt(String(charge.amountDueCents)), applied);
    return {
      unitCreditBalanceCents: balanceStr,
      creditAppliedCents: applied.toString(),
      netDueCents: net.toString(),
    };
  }

  async computeCreditAppliedForCharge(
    condominiumId: string,
    charge: CondominiumFeeCharge,
  ): Promise<bigint> {
    const balance = await this.getUnitBalanceCents(condominiumId, charge.unitId);
    const open = await this.chargeRepo.find({
      where: { condominiumId, unitId: charge.unitId, status: 'open' },
      order: { competenceYm: 'ASC' },
    });
    const alloc = allocateUnitCreditFifo(
      open.map((c) => ({
        id: c.id,
        competenceYm: c.competenceYm,
        amountDueCents: String(c.amountDueCents),
      })),
      balance,
    );
    return alloc.get(charge.id) ?? 0n;
  }

  async applyCreditOnSettle(
    mgr: EntityManager,
    condominiumId: string,
    userId: string,
    charge: CondominiumFeeCharge,
  ): Promise<bigint> {
    const balance = await mgr
      .getRepository(UnitFeeCreditEntry)
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.signed_amount_cents), 0)', 'sum')
      .where('e.condominium_id = :cid', { cid: condominiumId })
      .andWhere('e.unit_id = :uid', { uid: charge.unitId })
      .getRawOne<{ sum: string }>()
      .then((r) => BigInt(String(r?.sum ?? '0')));

    const open = await mgr.getRepository(CondominiumFeeCharge).find({
      where: { condominiumId, unitId: charge.unitId, status: 'open' },
      order: { competenceYm: 'ASC' },
    });
    const alloc = allocateUnitCreditFifo(
      open.map((c) => ({
        id: c.id,
        competenceYm: c.competenceYm,
        amountDueCents: String(c.amountDueCents),
      })),
      balance,
    );
    const creditApply = alloc.get(charge.id) ?? 0n;
    if (creditApply <= 0n) {
      return 0n;
    }

    await mgr.save(
      mgr.create(UnitFeeCreditEntry, {
        condominiumId,
        unitId: charge.unitId,
        signedAmountCents: (-creditApply).toString(),
        entryKind: 'credit_applied',
        justification: null,
        paymentReceiptStorageKey: null,
        bankAccountId: null,
        chargeId: charge.id,
        actorUserId: userId,
      }),
    );
    return creditApply;
  }

  async restoreCreditOnReopen(
    mgr: EntityManager,
    condominiumId: string,
    userId: string,
    chargeId: string,
  ): Promise<void> {
    const applied = await mgr.find(UnitFeeCreditEntry, {
      where: {
        condominiumId,
        chargeId,
        entryKind: 'credit_applied',
      },
    });
    for (const row of applied) {
      const amount = -BigInt(String(row.signedAmountCents));
      if (amount <= 0n) {
        continue;
      }
      await mgr.save(
        mgr.create(UnitFeeCreditEntry, {
          condominiumId,
          unitId: row.unitId,
          signedAmountCents: amount.toString(),
          entryKind: 'credit_restored',
          justification: null,
          paymentReceiptStorageKey: null,
          bankAccountId: null,
          chargeId,
          actorUserId: userId,
        }),
      );
    }
  }

  async getCreditAppliedOnChargeCents(
    condominiumId: string,
    chargeId: string,
  ): Promise<bigint> {
    const rows = await this.entryRepo.find({
      where: { condominiumId, chargeId, entryKind: 'credit_applied' },
    });
    let total = 0n;
    for (const r of rows) {
      total += -BigInt(String(r.signedAmountCents));
    }
    return total > 0n ? total : 0n;
  }

  computePixNetTotalCents(
    openCharges: CondominiumFeeCharge[],
    unitBalance: bigint,
  ): { totalGrossCents: bigint; totalNetCents: bigint; totalCreditCents: bigint } {
    const openRefs = openCharges.map((c) => ({
      id: c.id,
      competenceYm: c.competenceYm,
      amountDueCents: String(c.amountDueCents),
    }));
    const alloc = allocateUnitCreditFifo(openRefs, unitBalance);
    let gross = 0n;
    let credit = 0n;
    for (const c of openCharges) {
      gross += BigInt(String(c.amountDueCents));
      credit += alloc.get(c.id) ?? 0n;
    }
    const net = netDueAfterCredit(gross, credit);
    return {
      totalGrossCents: gross,
      totalNetCents: net,
      totalCreditCents: credit,
    };
  }

  private toView(e: UnitFeeCreditEntry): UnitFeeCreditEntryView {
    return {
      id: e.id,
      unitId: e.unitId,
      signedAmountCents: String(e.signedAmountCents),
      entryKind: e.entryKind,
      justification: e.justification,
      hasPaymentReceipt: !!e.paymentReceiptStorageKey,
      bankAccountId: e.bankAccountId,
      chargeId: e.chargeId,
      actorUserId: e.actorUserId,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private seesAllFeeCharges(access: CondoAccess): boolean {
    if (access.kind === 'owner') {
      return true;
    }
    if (access.kind === 'participant') {
      return (
        access.role === GovernanceRole.Syndic ||
        access.role === GovernanceRole.SubSyndic ||
        access.role === GovernanceRole.Admin ||
        access.role === GovernanceRole.Owner
      );
    }
    return false;
  }
}
