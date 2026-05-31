import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import { CondominiumBankAccount } from './entities/condominium-bank-account.entity';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
import {
  formatDateOnlyYmdUtc,
  parseDateOnlyFromApi,
  todayLocalCalendarAsUtcNoon,
} from './date-only.util';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import {
  lastDayBeforeCompetenceYm,
  firstDayOfCompetenceYm,
  lastDayOfCompetenceYm,
} from './finance-competence.util';

export type FundPeriodMovement = {
  incomeCents: bigint;
  /** Soma de despesas e aplicações no mês (valor positivo). */
  expenseCents: bigint;
};

/**
 * Saldo por fundo = soma cronológica dos lançamentos com `fund_id` até à data
 * indicada: `income` aumenta; `expense` e `investment` diminuem (valores em centavos).
 */
@Injectable()
export class FundBalanceService {
  constructor(
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    @InjectRepository(CondominiumFeeCharge)
    private readonly feeChargeRepo: Repository<CondominiumFeeCharge>,
    @InjectRepository(CondominiumBankAccount)
    private readonly bankAccountRepo: Repository<CondominiumBankAccount>,
  ) {}

  signedDeltaCents(t: Pick<FinancialTransaction, 'kind' | 'amountCents'>): bigint {
    const amount = BigInt(String(t.amountCents));
    if (t.kind === 'income') {
      return amount;
    }
    if (t.kind === 'expense' || t.kind === 'investment') {
      return -amount;
    }
    return 0n;
  }

  /**
   * Saldo por fundo até ao fim do dia `inclusiveEndYmd` (YYYY-MM-DD), inclusive.
   */
  /** Saldo de uma conta bancária até ao fim do dia (saldo inicial + movimentos + taxas quitadas sem receita). */
  async bankAccountBalanceAsOf(
    condominiumId: string,
    bankAccountId: string,
    inclusiveEndYmd: string,
  ): Promise<bigint> {
    const account = await this.bankAccountRepo.findOne({
      where: { id: bankAccountId, condominiumId },
    });
    if (!account) {
      return 0n;
    }
    const result = await this.bankAccountBalanceWithSeed(
      condominiumId,
      bankAccountId,
      inclusiveEndYmd,
      {
        initialBalanceCents: BigInt(String(account.initialBalanceCents)),
        initialBalanceOnYmd: formatDateOnlyYmdUtc(account.initialBalanceOn),
      },
    );
    return result.balance;
  }

  /**
   * Saldo projetado com saldo/data de referência informados (prévia antes de salvar).
   */
  async bankAccountBalanceWithSeed(
    condominiumId: string,
    bankAccountId: string | null,
    inclusiveEndYmd: string,
    seed: { initialBalanceCents: bigint; initialBalanceOnYmd: string },
  ): Promise<{
    balance: bigint;
    movementsDelta: bigint;
    transactionCount: number;
  }> {
    const endYmd = inclusiveEndYmd.slice(0, 10);
    const seedYmd = seed.initialBalanceOnYmd.slice(0, 10);
    if (endYmd < seedYmd) {
      return { balance: 0n, movementsDelta: 0n, transactionCount: 0 };
    }
    const end = parseDateOnlyFromApi(endYmd);
    const seedOn = parseDateOnlyFromApi(seedYmd);
    let run = seed.initialBalanceCents;
    let transactionCount = 0;

    if (bankAccountId) {
      const txs = await this.txRepo.find({
        where: {
          condominiumId,
          bankAccountId,
          occurredOn: Between(seedOn, end),
          paymentStatus: Not('cancelled'),
        },
        select: {
          id: true,
          kind: true,
          amountCents: true,
          occurredOn: true,
          paymentStatus: true,
        },
        order: { occurredOn: 'ASC', id: 'ASC' },
      });
      transactionCount = txs.length;
      for (const t of txs) {
        run += this.signedDeltaCents(t);
      }
      const orphanPaidFees = await this.feeChargeRepo.find({
        where: {
          condominiumId,
          status: 'paid',
          bankAccountId,
          paidAt: Between(seedOn, end),
          incomeTransactionId: IsNull(),
        },
        select: { id: true, amountDueCents: true },
      });
      for (const c of orphanPaidFees) {
        run += BigInt(String(c.amountDueCents));
      }
    }

    return {
      balance: run,
      movementsDelta: run - seed.initialBalanceCents,
      transactionCount,
    };
  }

  /** Soma dos saldos de todas as contas activas na data. */
  async totalActiveBankAccountsBalanceAsOf(
    condominiumId: string,
    inclusiveEndYmd: string,
  ): Promise<bigint> {
    const accounts = await this.bankAccountRepo.find({
      where: { condominiumId, isActive: true },
      select: { id: true },
    });
    let sum = 0n;
    for (const a of accounts) {
      sum += await this.bankAccountBalanceAsOf(
        condominiumId,
        a.id,
        inclusiveEndYmd,
      );
    }
    return sum;
  }

  /** Soma dos movimentos sem fundo (qualquer conta) até à data — componente «movimentos anteriores» no extrato. */
  async generalBalanceAsOf(
    condominiumId: string,
    inclusiveEndYmd: string,
  ): Promise<bigint> {
    const end = parseDateOnlyFromApi(inclusiveEndYmd.slice(0, 10));
    const txs = await this.txRepo.find({
      where: {
        condominiumId,
        fundId: IsNull(),
        occurredOn: LessThanOrEqual(end),
        paymentStatus: Not('cancelled'),
      },
      select: {
        id: true,
        kind: true,
        amountCents: true,
        occurredOn: true,
        paymentStatus: true,
      },
      order: { occurredOn: 'ASC', id: 'ASC' },
    });
    let run = 0n;
    for (const t of txs) {
      run += this.signedDeltaCents(t);
    }
    const orphanPaidFees = await this.feeChargeRepo.find({
      where: {
        condominiumId,
        status: 'paid',
        paidAt: LessThanOrEqual(end),
        incomeTransactionId: IsNull(),
        bankAccountId: Not(IsNull()),
      },
      select: { id: true, amountDueCents: true },
    });
    for (const c of orphanPaidFees) {
      run += BigInt(String(c.amountDueCents));
    }
    return run;
  }

  async balanceByFundAsOf(
    condominiumId: string,
    inclusiveEndYmd: string,
  ): Promise<Map<string, bigint>> {
    const end = parseDateOnlyFromApi(inclusiveEndYmd.slice(0, 10));
    const txs = await this.txRepo.find({
      where: {
        condominiumId,
        fundId: Not(IsNull()),
        occurredOn: LessThanOrEqual(end),
        paymentStatus: Not('cancelled'),
      },
      select: {
        id: true,
        fundId: true,
        kind: true,
        amountCents: true,
        occurredOn: true,
        paymentStatus: true,
      },
      order: { occurredOn: 'ASC', id: 'ASC' },
    });
    const map = new Map<string, bigint>();
    for (const t of txs) {
      if (!t.fundId) {
        continue;
      }
      const d = this.signedDeltaCents(t);
      map.set(t.fundId, (map.get(t.fundId) ?? 0n) + d);
    }
    return map;
  }

  /** Saldo atual (até hoje, data civil do servidor). */
  async totalBalanceCentsByFundId(
    condominiumId: string,
  ): Promise<Map<string, bigint>> {
    return this.balanceByFundAsOf(
      condominiumId,
      formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon()),
    );
  }

  /** Saldos inicial (último dia do mês anterior) e final (último dia da competência) para relatórios. */
  async fundBalancesForCompetenceReport(
    condominiumId: string,
    competenceYm: string,
  ): Promise<{
    openingYmd: string;
    closingYmd: string;
    openingByFund: Map<string, bigint>;
    closingByFund: Map<string, bigint>;
  }> {
    const openingYmd = lastDayBeforeCompetenceYm(competenceYm);
    const closingYmd = lastDayOfCompetenceYm(competenceYm);
    const [openingByFund, closingByFund] = await Promise.all([
      this.balanceByFundAsOf(condominiumId, openingYmd),
      this.balanceByFundAsOf(condominiumId, closingYmd),
    ]);
    return { openingYmd, closingYmd, openingByFund, closingByFund };
  }

  /**
   * Receitas e despesas/aplicações de cada fundo **somente na competência** (mês),
   * para extrato no PDF slip / transparência.
   */
  async fundPeriodMovementsByFund(
    condominiumId: string,
    competenceYm: string,
  ): Promise<Map<string, FundPeriodMovement>> {
    const from = parseDateOnlyFromApi(firstDayOfCompetenceYm(competenceYm));
    const to = parseDateOnlyFromApi(lastDayOfCompetenceYm(competenceYm));
    const txs = await this.txRepo.find({
      where: {
        condominiumId,
        fundId: Not(IsNull()),
        occurredOn: Between(from, to),
        paymentStatus: Not('cancelled'),
      },
      select: {
        fundId: true,
        kind: true,
        amountCents: true,
      },
      order: { occurredOn: 'ASC', id: 'ASC' },
    });

    const map = new Map<string, FundPeriodMovement>();
    for (const t of txs) {
      if (!t.fundId) {
        continue;
      }
      const cur = map.get(t.fundId) ?? {
        incomeCents: 0n,
        expenseCents: 0n,
      };
      const amount = BigInt(String(t.amountCents));
      if (t.kind === 'income') {
        cur.incomeCents += amount;
      } else if (t.kind === 'expense' || t.kind === 'investment') {
        cur.expenseCents += amount;
      }
      map.set(t.fundId, cur);
    }
    return map;
  }

  /**
   * Para o filtro por fundo: saldo após cada lançamento desse fundo, por ordem cronológica.
   */
  async runningBalanceCentsByTransactionId(
    _condominiumId: string,
    fundId: string,
    transactionsDescOrder: FinancialTransaction[],
  ): Promise<Map<string, string>> {
    const asc = [...transactionsDescOrder].sort((a, b) =>
      this.compareChronological(a, b),
    );
    let run = 0n;
    const afterByTxId = new Map<string, string>();
    for (const t of asc) {
      if (t.paymentStatus === 'cancelled') {
        continue;
      }
      if (t.fundId !== fundId) {
        continue;
      }
      run += this.signedDeltaCents(t);
      afterByTxId.set(t.id, run.toString());
    }
    return afterByTxId;
  }

  compareChronological(
    a: Pick<FinancialTransaction, 'occurredOn' | 'id'>,
    b: Pick<FinancialTransaction, 'occurredOn' | 'id'>,
  ): number {
    const da = formatDateOnlyYmdUtc(a.occurredOn).localeCompare(
      formatDateOnlyYmdUtc(b.occurredOn),
    );
    if (da !== 0) {
      return da;
    }
    return a.id.localeCompare(b.id);
  }
}
