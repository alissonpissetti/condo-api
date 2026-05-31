import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import {
  formatDateOnlyYmdUtc,
  parseDateOnlyFromApi,
  todayLocalCalendarAsUtcNoon,
  ymdBefore,
} from './date-only.util';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
import { FinancialFund } from './entities/financial-fund.entity';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { FundMonthlyAccrual } from './entities/fund-monthly-accrual.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';
import { GovernanceService } from '../planning/governance.service';
import { CondominiumBankAccountsService } from './condominium-bank-accounts.service';
import {
  accessAllowsManagement,
  genericFeeMovementTitle,
} from './finance-extrato-display.util';
import { FundBalanceService } from './fund-balance.service';
import { openFeePaymentStatus, openFeeTitle } from './open-fee-due.util';

export interface StatementByUnitRow {
  unitId: string;
  unitIdentifier: string;
  groupingName: string;
  balanceCents: string;
}

export interface StatementTransactionRow {
  id: string;
  kind: string;
  title: string;
  amountCents: string;
  occurredOn: string;
  fundId: string | null;
  fundName: string | null;
  paymentStatus: string;
}

export interface StatementMovementRow {
  id: string;
  kind: string;
  title: string;
  occurredOn: string;
  paymentStatus: string;
  signedDeltaCents: string;
  runningAfterCents: string;
  /** `transaction` | `fee_payment` | `fee_overdue` */
  lineType?: string;
  competenceYm?: string | null;
  unitIdentifier?: string | null;
  /** Conta bancária que recebeu ou pagou o movimento (quando aplicável). */
  bankAccountName?: string | null;
  /** Quando `false`, não altera o saldo de caixa (ex.: taxa em atraso prevista). */
  affectsBalance?: boolean;
}

export interface StatementOverdueFeeRow {
  id: string;
  competenceYm: string;
  unitIdentifier: string;
  groupingName: string;
  dueOn: string;
  amountDueCents: string;
}

export interface StatementLedgerSection {
  fundId: string | null;
  fundName: string | null;
  openingBalanceCents: string;
  closingBalanceCents: string;
  movements: StatementMovementRow[];
  /** Soma dos saldos iniciais das contas bancárias activas (só conta geral). */
  bankAccountsSeedCents?: string;
  /** Data do saldo bancário usado no detalhe (YYYY-MM-DD). */
  bankAccountsAsOfYmd?: string;
  /** Saldo de movimentos até ao dia anterior ao período, sem seed bancário. */
  movementsOpeningBalanceCents?: string;
  /** Abertura calculada a partir do saldo actual menos movimentos do período. */
  openingDerivedFromCurrentBalance?: boolean;
  /** Taxas condominiais em aberto com vencimento até ao fim do período. */
  overdueFees?: StatementOverdueFeeRow[];
  overdueFeesTotalCents?: string;
  /** Saldo de caixa + total previsto em atraso. */
  projectedBalanceCents?: string;
}

export interface StatementResult {
  from: string;
  to: string;
  byUnit: StatementByUnitRow[];
  /** Lista plana (compatibilidade); ordem decrescente por data. */
  transactions: StatementTransactionRow[];
  general: StatementLedgerSection;
  funds: StatementLedgerSection[];
}

type GeneralLedgerEvent =
  | {
      sortYmd: string;
      sortId: string;
      type: 'transaction';
      tx: FinancialTransaction;
    }
  | {
      sortYmd: string;
      sortId: string;
      type: 'fee_payment';
      charge: CondominiumFeeCharge;
    };

@Injectable()
export class FinanceStatementService {
  constructor(
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    @InjectRepository(TransactionUnitShare)
    private readonly shareRepo: Repository<TransactionUnitShare>,
    @InjectRepository(CondominiumFeeCharge)
    private readonly chargeRepo: Repository<CondominiumFeeCharge>,
    @InjectRepository(FinancialFund)
    private readonly fundRepo: Repository<FinancialFund>,
    private readonly condominiumsService: CondominiumsService,
    private readonly fundBalance: FundBalanceService,
    private readonly bankAccounts: CondominiumBankAccountsService,
    private readonly governance: GovernanceService,
  ) {}

  async statement(
    condominiumId: string,
    userId: string,
    from: string,
    to: string,
    fundId?: string,
  ): Promise<StatementResult> {
    const access = await this.governance.assertAnyAccess(condominiumId, userId);
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to are required (YYYY-MM-DD)',
      );
    }
    const fromD = new Date(from);
    const toD = new Date(to);
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    if (fromD > toD) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const fromStr = from.trim().slice(0, 10);
    const toStr = to.trim().slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fromStr) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toStr)
    ) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }

    const openingAsOfYmd = ymdBefore(fromStr);
    const fromDate = parseDateOnlyFromApi(fromStr);
    const toDate = parseDateOnlyFromApi(toStr);

    const txQb = this.txRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fund', 'fund')
      .leftJoinAndSelect('t.bankAccount', 'bankAccount')
      .where('t.condominium_id = :cid', { cid: condominiumId })
      .andWhere('t.occurred_on >= :from', { from: fromStr })
      .andWhere('t.occurred_on <= :to', { to: toStr })
      .orderBy('t.occurred_on', 'DESC')
      .addOrderBy('t.created_at', 'DESC');
    if (fundId) {
      txQb.andWhere('t.fund_id = :fundId', { fundId });
    }
    const txList = await txQb.getMany();

    const shareQb = this.shareRepo
      .createQueryBuilder('s')
      .innerJoin('s.transaction', 't')
      .leftJoin(
        FundMonthlyAccrual,
        'fma',
        'fma.transaction_id = t.id',
      )
      .innerJoin('s.unit', 'u')
      .innerJoin('u.grouping', 'g')
      .where('t.condominium_id = :cid', { cid: condominiumId })
      .andWhere('t.payment_status IN (:...ps)', { ps: ['pending', 'paid'] })
      /* Conta geral: lançamentos sem fundo. Inclui mensalidade automática de fundo (fma). */
      .andWhere('(t.fund_id IS NULL OR fma.id IS NOT NULL)')
      .andWhere('t.occurred_on >= :from', { from: fromStr })
      .andWhere('t.occurred_on <= :to', { to: toStr })
      .select('u.id', 'unitId')
      .addSelect('u.identifier', 'unitIdentifier')
      .addSelect('g.name', 'groupingName')
      .addSelect(
        `SUM(CASE WHEN fma.id IS NOT NULL THEN ABS(s.share_cents) ELSE s.share_cents END)`,
        'balanceCents',
      )
      .groupBy('u.id')
      .addGroupBy('u.identifier')
      .addGroupBy('g.name')
      .orderBy('g.name', 'ASC')
      .addOrderBy('u.identifier', 'ASC');
    if (fundId) {
      shareQb.andWhere('t.fund_id = :fundId', { fundId });
    }
    const byUnitRaw = await shareQb.getRawMany();

    const openingByFund = await this.fundBalance.balanceByFundAsOf(
      condominiumId,
      openingAsOfYmd,
    );

    const generalTxs = txList.filter((t) => !t.fundId);
    const general = await this.buildGeneralSection(
      condominiumId,
      fromStr,
      toStr,
      fromDate,
      toDate,
      generalTxs,
    );

    const allFunds = await this.fundRepo.find({
      where: { condominiumId },
      order: { name: 'ASC' },
    });
    const funds: StatementLedgerSection[] = allFunds.map((f) => {
      const fundTxs = txList.filter((t) => t.fundId === f.id);
      const opening = openingByFund.get(f.id) ?? 0n;
      return this.buildLedgerSection(f.id, f.name, opening, fundTxs);
    });

    let result: StatementResult;
    if (fundId) {
      const onlyFund = funds.find((f) => f.fundId === fundId);
      result = {
        from: fromStr,
        to: toStr,
        byUnit: byUnitRaw.map((r) => ({
          unitId: r.unitId,
          unitIdentifier: r.unitIdentifier,
          groupingName: r.groupingName,
          balanceCents: String(r.balanceCents ?? '0'),
        })),
        transactions: txList.map((t) => this.toTransactionRow(t)),
        general: this.emptySection(null, null),
        funds: onlyFund ? [onlyFund] : [],
      };
    } else {
      result = {
        from: fromStr,
        to: toStr,
        byUnit: byUnitRaw.map((r) => ({
          unitId: r.unitId,
          unitIdentifier: r.unitIdentifier,
          groupingName: r.groupingName,
          balanceCents: String(r.balanceCents ?? '0'),
        })),
        transactions: txList.map((t) => this.toTransactionRow(t)),
        general,
        funds,
      };
    }

    if (!accessAllowsManagement(access)) {
      return this.anonymizeStatementForResident(result);
    }
    return result;
  }

  /** Extrato para condômino: sem rateio por unidade nem identificação em taxas. */
  private anonymizeStatementForResident(
    result: StatementResult,
  ): StatementResult {
    return {
      ...result,
      byUnit: [],
      general: this.anonymizeLedgerSection(result.general),
      funds: result.funds.map((f) => this.anonymizeLedgerSection(f)),
    };
  }

  private anonymizeLedgerSection(
    section: StatementLedgerSection,
  ): StatementLedgerSection {
    return {
      ...section,
      movements: section.movements.map((m) => this.anonymizeMovementRow(m)),
      overdueFees: section.overdueFees?.map((f) => ({
        ...f,
        unitIdentifier: '—',
        groupingName: '—',
      })),
    };
  }

  private anonymizeMovementRow(
    row: StatementMovementRow,
  ): StatementMovementRow {
    if (row.lineType === 'fee_payment' || row.lineType === 'fee_overdue') {
      const todayYmd = formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon());
      return {
        ...row,
        title: genericFeeMovementTitle(
          row.lineType,
          row.competenceYm,
          row.lineType === 'fee_overdue' ? row.occurredOn : undefined,
          row.lineType === 'fee_overdue' ? todayYmd : undefined,
        ),
        unitIdentifier: null,
      };
    }
    return row;
  }

  private minYmd(a: string, b: string): string {
    return a.localeCompare(b) <= 0 ? a : b;
  }

  private generalEventCashDelta(ev: GeneralLedgerEvent): bigint {
    if (ev.type === 'transaction') {
      if (ev.tx.paymentStatus === 'cancelled') {
        return 0n;
      }
      return this.fundBalance.signedDeltaCents(ev.tx);
    }
    return BigInt(String(ev.charge.amountDueCents));
  }

  private async buildGeneralSection(
    condominiumId: string,
    fromStr: string,
    toStr: string,
    fromDate: Date,
    toDate: Date,
    generalTxs: FinancialTransaction[],
  ): Promise<StatementLedgerSection> {
    const paidInPeriod = await this.chargeRepo.find({
      where: {
        condominiumId,
        status: 'paid',
        paidAt: Between(fromDate, toDate),
      },
      relations: { unit: { grouping: true }, bankAccount: true },
      order: { paidAt: 'ASC', id: 'ASC' },
    });

    const linkedIncomeIds = new Set(
      paidInPeriod
        .map((c) => c.incomeTransactionId?.trim())
        .filter((id): id is string => Boolean(id)),
    );

    const overdueCharges = await this.chargeRepo.find({
      where: {
        condominiumId,
        status: 'open',
        dueOn: LessThanOrEqual(toDate),
      },
      relations: { unit: { grouping: true } },
      order: { dueOn: 'ASC', competenceYm: 'ASC', id: 'ASC' },
    });

    const events: GeneralLedgerEvent[] = [];
    for (const t of generalTxs) {
      if (linkedIncomeIds.has(t.id)) {
        continue;
      }
      events.push({
        sortYmd: formatDateOnlyYmdUtc(t.occurredOn),
        sortId: t.id,
        type: 'transaction',
        tx: t,
      });
    }
    for (const c of paidInPeriod) {
      const paidYmd = c.paidAt
        ? formatDateOnlyYmdUtc(c.paidAt)
        : formatDateOnlyYmdUtc(toDate);
      events.push({
        sortYmd: paidYmd,
        sortId: c.id,
        type: 'fee_payment',
        charge: c,
      });
    }
    events.sort((a, b) => {
      const d = a.sortYmd.localeCompare(b.sortYmd);
      if (d !== 0) {
        return d;
      }
      return a.sortId.localeCompare(b.sortId);
    });

    const todayYmd = formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon());
    const effectiveEndYmd = this.minYmd(toStr, todayYmd);
    const cashAtEffectiveEnd =
      await this.fundBalance.totalActiveBankAccountsBalanceAsOf(
        condominiumId,
        effectiveEndYmd,
      );
    let periodNet = 0n;
    for (const ev of events) {
      if (ev.sortYmd.localeCompare(effectiveEndYmd) > 0) {
        continue;
      }
      periodNet += this.generalEventCashDelta(ev);
    }
    const opening = cashAtEffectiveEnd - periodNet;
    const derivedFromToday =
      await this.bankAccounts.hasReferenceInsidePeriod(
        condominiumId,
        fromStr,
        toStr,
      );
    let bankSeed: bigint;
    let movementsOpening: bigint;
    if (derivedFromToday) {
      bankSeed = cashAtEffectiveEnd;
      movementsOpening = -periodNet;
    } else {
      bankSeed = await this.bankAccounts.referenceSeedTotalForPeriodStart(
        condominiumId,
        fromStr,
        toStr,
      );
      movementsOpening = opening - bankSeed;
    }

    let run = opening;
    const movements: StatementMovementRow[] = [];
    for (const ev of events) {
      if (ev.type === 'transaction') {
        const t = ev.tx;
        const cancelled = t.paymentStatus === 'cancelled';
        const delta = cancelled ? 0n : this.fundBalance.signedDeltaCents(t);
        if (!cancelled) {
          run += delta;
        }
        movements.push({
          id: t.id,
          kind: t.kind,
          title: t.title,
          occurredOn: formatDateOnlyYmdUtc(t.occurredOn),
          paymentStatus: t.paymentStatus,
          signedDeltaCents: cancelled ? '0' : delta.toString(),
          runningAfterCents: run.toString(),
          lineType: 'transaction',
          bankAccountName: t.bankAccount?.name?.trim() || null,
          affectsBalance: true,
        });
      } else {
        const c = ev.charge;
        const delta = BigInt(String(c.amountDueCents));
        run += delta;
        const uid = c.unit?.identifier?.trim() || '—';
        const grp = c.unit?.grouping?.name?.trim();
        const ym = c.competenceYm;
        const title = grp
          ? `Pagamento taxa condominial — ${uid} (${grp}) · ${ym}`
          : `Pagamento taxa condominial — ${uid} · ${ym}`;
        movements.push({
          id: `fee-paid-${c.id}`,
          kind: 'income',
          title,
          occurredOn: ev.sortYmd,
          paymentStatus: 'paid',
          signedDeltaCents: delta.toString(),
          runningAfterCents: run.toString(),
          lineType: 'fee_payment',
          competenceYm: ym,
          unitIdentifier: uid,
          bankAccountName: c.bankAccount?.name?.trim() || null,
          affectsBalance: true,
        });
      }
    }

    /** Mesmo valor da última linha de caixa na tabela (abertura + lançamentos da conta geral). */
    const closingCash = run;

    let overdueTotal = 0n;
    let projectedRun = run;
    const overdueFees: StatementOverdueFeeRow[] = [];
    for (const c of overdueCharges) {
      const amt = BigInt(String(c.amountDueCents));
      overdueTotal += amt;
      projectedRun += amt;
      const uid = c.unit?.identifier?.trim() || '—';
      const grp = c.unit?.grouping?.name?.trim();
      const ym = c.competenceYm;
      const dueYmd = formatDateOnlyYmdUtc(c.dueOn);
      overdueFees.push({
        id: c.id,
        competenceYm: ym,
        unitIdentifier: uid,
        groupingName: grp || '—',
        dueOn: dueYmd,
        amountDueCents: amt.toString(),
      });
      const title = openFeeTitle(uid, grp, ym, dueYmd, todayYmd);
      movements.push({
        id: `fee-overdue-${c.id}`,
        kind: 'income',
        title,
        occurredOn: dueYmd,
        paymentStatus: openFeePaymentStatus(dueYmd, todayYmd),
        signedDeltaCents: amt.toString(),
        runningAfterCents: projectedRun.toString(),
        lineType: 'fee_overdue',
        competenceYm: ym,
        unitIdentifier: uid,
        affectsBalance: false,
      });
    }

    return {
      fundId: null,
      fundName: null,
      openingBalanceCents: opening.toString(),
      /** Saldo de caixa após os lançamentos da conta geral no período (última linha antes de atrasos). */
      closingBalanceCents: closingCash.toString(),
      movements,
      bankAccountsSeedCents: bankSeed.toString(),
      bankAccountsAsOfYmd: effectiveEndYmd,
      movementsOpeningBalanceCents: movementsOpening.toString(),
      openingDerivedFromCurrentBalance: derivedFromToday,
      overdueFees,
      overdueFeesTotalCents: overdueTotal.toString(),
      projectedBalanceCents: (run + overdueTotal).toString(),
    };
  }

  private emptySection(
    fundId: string | null,
    fundName: string | null,
  ): StatementLedgerSection {
    return {
      fundId,
      fundName,
      openingBalanceCents: '0',
      closingBalanceCents: '0',
      movements: [],
      overdueFees: [],
      overdueFeesTotalCents: '0',
      projectedBalanceCents: '0',
    };
  }

  private buildLedgerSection(
    fundId: string | null,
    fundName: string | null,
    opening: bigint,
    txs: FinancialTransaction[],
  ): StatementLedgerSection {
    const sorted = [...txs].sort((a, b) => {
      const da = formatDateOnlyYmdUtc(a.occurredOn).localeCompare(
        formatDateOnlyYmdUtc(b.occurredOn),
      );
      if (da !== 0) {
        return da;
      }
      return a.id.localeCompare(b.id);
    });
    let run = opening;
    const movements: StatementMovementRow[] = [];
    for (const t of sorted) {
      const cancelled = t.paymentStatus === 'cancelled';
      const delta = cancelled ? 0n : this.fundBalance.signedDeltaCents(t);
      if (!cancelled) {
        run += delta;
      }
      movements.push({
        id: t.id,
        kind: t.kind,
        title: t.title,
        occurredOn: formatDateOnlyYmdUtc(t.occurredOn),
        paymentStatus: t.paymentStatus,
        signedDeltaCents: cancelled ? '0' : delta.toString(),
        runningAfterCents: run.toString(),
        lineType: 'transaction',
        affectsBalance: true,
      });
    }
    return {
      fundId,
      fundName,
      openingBalanceCents: opening.toString(),
      closingBalanceCents: run.toString(),
      movements,
    };
  }

  private toTransactionRow(t: FinancialTransaction): StatementTransactionRow {
    return {
      id: t.id,
      kind: t.kind,
      title: t.title,
      amountCents: t.amountCents,
      occurredOn: formatDateOnlyYmdUtc(t.occurredOn),
      fundId: t.fundId,
      fundName: t.fund?.name ?? null,
      paymentStatus: t.paymentStatus,
    };
  }

}
