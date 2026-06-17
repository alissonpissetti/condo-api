import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AllocationResolverService } from './allocation-resolver.service';
import { isAllocationRule } from './allocation.types';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { FinancialFund } from './entities/financial-fund.entity';
import { distributePositiveCents } from './distribute-cents';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { FundMonthlyAccrual } from './entities/fund-monthly-accrual.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';
import { CondominiumBankAccountsService } from './condominium-bank-accounts.service';
import { FinancialTransactionsService } from './financial-transactions.service';
import { lastDayOfCompetenceYm, ymCompare } from './finance-competence.util';

@Injectable()
export class FundAccrualService {
  private readonly logger = new Logger(FundAccrualService.name);

  constructor(
    @InjectRepository(FinancialFund)
    private readonly fundRepo: Repository<FinancialFund>,
    @InjectRepository(FundMonthlyAccrual)
    private readonly accrualRepo: Repository<FundMonthlyAccrual>,
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    private readonly allocationResolver: AllocationResolverService,
    private readonly txService: FinancialTransactionsService,
    private readonly bankAccounts: CondominiumBankAccountsService,
  ) {}

  /**
   * Gera mensalidades de fundo (receita, quitada) para a competência (idempotente por fundo + YM).
   */
  async ensureAccrualsForCompetence(
    condominiumId: string,
    competenceYm: string,
  ): Promise<void> {
    const funds = await this.fundRepo.find({
      where: { condominiumId },
      order: { createdAt: 'ASC' },
    });

    for (const fund of funds) {
      await this.ensureSingleFundAccrual(condominiumId, fund, competenceYm);
    }
  }

  /**
   * Apaga despesas de mensalidade de fundo geradas pelo fechamento (`FundMonthlyAccrual`)
   * para a competência. As linhas em `fund_monthly_accruals` somem em cascata.
   *
   * Usado na **regeneração** de cobranças: assim os rateios são refeitos com a regra
   * atual do fundo e com as unidades nos agrupamentos atuais.
   */
  async removeAccrualsForCompetence(
    condominiumId: string,
    competenceYm: string,
  ): Promise<void> {
    const accruals = await this.accrualRepo.find({
      where: { competenceYm },
      relations: { fund: true },
    });
    const txIds = [
      ...new Set(
        accruals
          .filter((a) => a.fund?.condominiumId === condominiumId)
          .map((a) => a.transactionId),
      ),
    ];
    if (txIds.length === 0) {
      return;
    }
    const txs = await this.txRepo.find({
      where: { id: In(txIds), condominiumId },
      select: { id: true, paymentStatus: true },
    });
    const deletableIds = txs
      .filter((t) => t.paymentStatus === 'pending')
      .map((t) => t.id);
    if (deletableIds.length === 0) {
      return;
    }
    await this.txRepo.delete({ id: In(deletableIds) });
  }

  /**
   * Mensalidades antigas foram geradas como despesa; converte para receita (saldo do fundo)
   * mantendo o vínculo com fund_monthly_accruals.
   */
  private async normalizeLegacyAccrualTransaction(
    transactionId: string,
  ): Promise<void> {
    const tx = await this.txRepo.findOne({
      where: { id: transactionId },
      relations: { unitShares: true },
    });
    if (!tx) {
      return;
    }
    if (tx.kind === 'income' && tx.paymentStatus === 'paid') {
      return;
    }
    if (tx.kind !== 'income') {
      if (tx.paymentStatus !== 'pending') {
        return;
      }
      const unitIds = (tx.unitShares ?? []).map((s) => s.unitId);
      if (unitIds.length === 0) {
        return;
      }
      const amountCents = Number(tx.amountCents);
      const shares = this.buildAccrualShares(amountCents, unitIds);
      tx.kind = 'income';
      await this.txRepo.manager.delete(TransactionUnitShare, { transactionId });
      await this.txRepo.manager.save(
        shares.map((row) =>
          this.txRepo.manager.create(TransactionUnitShare, {
            transactionId,
            unitId: row.unitId,
            shareCents: row.shareCents,
          }),
        ),
      );
    }
    if (tx.paymentStatus !== 'paid') {
      tx.paymentStatus = 'paid';
      await this.txRepo.save(tx);
    }
  }

  private buildAccrualShares(
    amountCents: number,
    unitIds: string[],
  ): { unitId: string; shareCents: string }[] {
    const parts = distributePositiveCents(BigInt(amountCents), unitIds.length);
    return unitIds.map((unitId, i) => ({
      unitId,
      shareCents: (-parts[i]).toString(),
    }));
  }

  private async ensureSingleFundAccrual(
    condominiumId: string,
    fund: FinancialFund,
    competenceYm: string,
  ): Promise<void> {
    const existing = await this.accrualRepo.findOne({
      where: { fundId: fund.id, competenceYm },
    });
    if (existing) {
      await this.normalizeLegacyAccrualTransaction(existing.transactionId);
      return;
    }

    const rule = fund.allocationRule;
    if (!rule || !isAllocationRule(rule) || rule.kind === 'none') {
      return;
    }

    const unitIds = await this.allocationResolver.resolveUnitIds(
      condominiumId,
      rule,
    );
    if (unitIds.length === 0) {
      return;
    }
    const n = unitIds.length;

    let amountCents: number;
    if (fund.isPermanent) {
      const per = fund.permanentMonthlyDebitCents
        ? Number(fund.permanentMonthlyDebitCents)
        : 0;
      if (!Number.isFinite(per) || per < 1) {
        return;
      }
      amountCents = per * n;
    } else {
      const start = fund.periodStartYm;
      const end = fund.periodEndYm;
      if (!start || !end) {
        return;
      }
      if (
        ymCompare(competenceYm, start) < 0 ||
        ymCompare(competenceYm, end) > 0
      ) {
        return;
      }
      const per = fund.termMonthlyPerUnitCents
        ? Number(fund.termMonthlyPerUnitCents)
        : 0;
      if (!Number.isFinite(per) || per < 1) {
        return;
      }
      amountCents = per * n;
    }

    if (amountCents < 1) {
      return;
    }

    const occurredOn = lastDayOfCompetenceYm(competenceYm);
    const bankAccountId =
      await this.bankAccounts.resolvePrimaryAccountId(condominiumId);
    const dto: CreateTransactionDto = {
      /** Receita: aumenta o saldo do fundo; rateio negativo nas unidades entra na taxa via ABS em sumSharesByUnit. */
      kind: 'income',
      amountCents,
      occurredOn,
      title: `Mensalidade fundo ${fund.name} (${competenceYm})`,
      description: 'Lançamento automático do fechamento mensal.',
      bankAccountId,
      fundId: fund.id,
      allocationRule: rule,
    };

    try {
      const tx = await this.txService.createInternal(condominiumId, dto, {
        paymentStatus: 'paid',
      });
      await this.accrualRepo.save(
        this.accrualRepo.create({
          fundId: fund.id,
          competenceYm,
          transactionId: tx.id,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Accrual failed condo=${condominiumId} fund=${fund.id} ym=${competenceYm}: ${String(err)}`,
      );
    }
  }
}
