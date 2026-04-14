import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CondominiumsModule } from '../condominiums/condominiums.module';
import { Grouping } from '../groupings/grouping.entity';
import { Unit } from '../units/unit.entity';
import { AllocationResolverService } from './allocation-resolver.service';
import { CondominiumFeesController } from './condominium-fees.controller';
import { CondominiumFeesService } from './condominium-fees.service';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
import { FinancialFund } from './entities/financial-fund.entity';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { FundMonthlyAccrual } from './entities/fund-monthly-accrual.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';
import { FinanceMonthCronService } from './finance-month-cron.service';
import { FinanceStatementController } from './finance-statement.controller';
import { FinanceStatementService } from './finance-statement.service';
import { FinancialFundsController } from './financial-funds.controller';
import { FinancialFundsService } from './financial-funds.service';
import { FinancialTransactionsController } from './financial-transactions.controller';
import { FinancialTransactionsService } from './financial-transactions.service';
import { FundAccrualService } from './fund-accrual.service';
import { TransactionReceiptsController } from './transaction-receipts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinancialFund,
      FinancialTransaction,
      TransactionUnitShare,
      FundMonthlyAccrual,
      CondominiumFeeCharge,
      Unit,
      Grouping,
    ]),
    CondominiumsModule,
  ],
  controllers: [
    FinancialFundsController,
    FinancialTransactionsController,
    TransactionReceiptsController,
    FinanceStatementController,
    CondominiumFeesController,
  ],
  providers: [
    AllocationResolverService,
    FinancialFundsService,
    FinancialTransactionsService,
    FinanceStatementService,
    FundAccrualService,
    CondominiumFeesService,
    FinanceMonthCronService,
  ],
})
export class FinanceModule {}
