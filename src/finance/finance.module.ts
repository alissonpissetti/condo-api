import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CondominiumsModule } from '../condominiums/condominiums.module';
import { Grouping } from '../groupings/grouping.entity';
import { Unit } from '../units/unit.entity';
import { AllocationResolverService } from './allocation-resolver.service';
import { FinancialFund } from './entities/financial-fund.entity';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';
import { FinanceStatementController } from './finance-statement.controller';
import { FinanceStatementService } from './finance-statement.service';
import { FinancialFundsController } from './financial-funds.controller';
import { FinancialFundsService } from './financial-funds.service';
import { FinancialTransactionsController } from './financial-transactions.controller';
import { FinancialTransactionsService } from './financial-transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinancialFund,
      FinancialTransaction,
      TransactionUnitShare,
      Unit,
      Grouping,
    ]),
    CondominiumsModule,
  ],
  controllers: [
    FinancialFundsController,
    FinancialTransactionsController,
    FinanceStatementController,
  ],
  providers: [
    AllocationResolverService,
    FinancialFundsService,
    FinancialTransactionsService,
    FinanceStatementService,
  ],
})
export class FinanceModule {}
