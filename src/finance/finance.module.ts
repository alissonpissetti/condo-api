import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CondominiumsModule } from '../condominiums/condominiums.module';
import { PlanningModule } from '../planning/planning.module';
import { UsersModule } from '../users/users.module';
import { TwilioWhatsappModule } from '../twilio-whatsapp/twilio-whatsapp.module';
import { Grouping } from '../groupings/grouping.entity';
import { CondominiumParticipant } from '../planning/entities/condominium-participant.entity';
import { Unit } from '../units/unit.entity';
import { UnitResponsiblePerson } from '../units/unit-responsible-person.entity';
import { AllocationResolverService } from './allocation-resolver.service';
import { CondominiumFeesController } from './condominium-fees.controller';
import { CondominiumFeesService } from './condominium-fees.service';
import { PublicFeeSlipController } from './public-fee-slip.controller';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
import { CondominiumFeeChargePaymentLog } from './entities/condominium-fee-charge-payment-log.entity';
import { FinancialFund } from './entities/financial-fund.entity';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { FundMonthlyAccrual } from './entities/fund-monthly-accrual.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';
import { FinanceMonthCronService } from './finance-month-cron.service';
import { FinanceStatementController } from './finance-statement.controller';
import { FinanceStatementService } from './finance-statement.service';
import { MonthlyTransparencyPdfService } from './monthly-transparency-pdf.service';
import { FinancialFundsController } from './financial-funds.controller';
import { FinancialFundsService } from './financial-funds.service';
import { FinancialTransactionsController } from './financial-transactions.controller';
import { FinancialTransactionsService } from './financial-transactions.service';
import { FundAccrualService } from './fund-accrual.service';
import { FundBalanceService } from './fund-balance.service';
import { TransactionReceiptsController } from './transaction-receipts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinancialFund,
      FinancialTransaction,
      TransactionUnitShare,
      FundMonthlyAccrual,
      CondominiumFeeCharge,
      CondominiumFeeChargePaymentLog,
      Unit,
      UnitResponsiblePerson,
      Grouping,
      CondominiumParticipant,
    ]),
    CondominiumsModule,
    PlanningModule,
    UsersModule,
    TwilioWhatsappModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '25m',
        },
      }),
    }),
  ],
  controllers: [
    FinancialFundsController,
    FinancialTransactionsController,
    TransactionReceiptsController,
    FinanceStatementController,
    CondominiumFeesController,
    PublicFeeSlipController,
  ],
  providers: [
    AllocationResolverService,
    FinancialFundsService,
    FinancialTransactionsService,
    FinanceStatementService,
    FundAccrualService,
    FundBalanceService,
    CondominiumFeesService,
    MonthlyTransparencyPdfService,
    FinanceMonthCronService,
  ],
})
export class FinanceModule {}
