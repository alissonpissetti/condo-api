import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import {
  formatDateOnlyYmdUtc,
  parseDateOnlyFromApi,
  todayLocalCalendarAsUtcNoon,
} from './date-only.util';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import {
  lastDayBeforeCompetenceYm,
  lastDayOfCompetenceYm,
} from './finance-competence.util';

/**
 * Saldo por fundo = soma cronológica dos lançamentos com `fund_id` até à data
 * indicada: `income` aumenta; `expense` e `investment` diminuem (valores em centavos).
 */
@Injectable()
export class FundBalanceService {
  constructor(
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
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
      },
      select: {
        id: true,
        fundId: true,
        kind: true,
        amountCents: true,
        occurredOn: true,
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
