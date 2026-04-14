import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AllocationResolverService } from './allocation-resolver.service';
import { isAllocationRule } from './allocation.types';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { FinancialFund } from './entities/financial-fund.entity';
import { FundMonthlyAccrual } from './entities/fund-monthly-accrual.entity';
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
    private readonly allocationResolver: AllocationResolverService,
    private readonly txService: FinancialTransactionsService,
  ) {}

  /**
   * Gera despesas de fundo para a competência (idempotente por fundo + YM).
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

  private async ensureSingleFundAccrual(
    condominiumId: string,
    fund: FinancialFund,
    competenceYm: string,
  ): Promise<void> {
    const existing = await this.accrualRepo.findOne({
      where: { fundId: fund.id, competenceYm },
    });
    if (existing) {
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
    const dto: CreateTransactionDto = {
      kind: 'expense',
      amountCents,
      occurredOn,
      title: `Mensalidade fundo ${fund.name} (${competenceYm})`,
      description: 'Lançamento automático do fechamento mensal.',
      fundId: fund.id,
      allocationRule: rule,
    };

    try {
      const tx = await this.txService.createInternal(condominiumId, dto);
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
