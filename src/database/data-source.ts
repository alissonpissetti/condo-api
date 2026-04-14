import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import type { DataSourceOptions } from 'typeorm';
import { DataSource } from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { Grouping } from '../groupings/grouping.entity';
import { InitialSchema1744300000000 } from '../migrations/1744300000000-initial-schema';
import { UnitPersonsAndInvitations1744500000000 } from '../migrations/1744500000000-unit-persons-invitations';
import { Person } from '../people/person.entity';
import { UnitInvitation } from '../people/unit-invitation.entity';
import { Unit } from '../units/unit.entity';
import { LoginSmsChallenge } from '../auth/login-sms-challenge.entity';
import { PasswordResetChallenge } from '../auth/password-reset-challenge.entity';
import { Financial1744850000000 } from '../migrations/1744850000000-financial';
import { PasswordResetChallenges1744900000000 } from '../migrations/1744900000000-password-reset-challenges';
import { FinancialFundPeriod1744950000000 } from '../migrations/1744950000000-financial-fund-period';
import { FundsPermanentAllocation1744960000000 } from '../migrations/1744960000000-funds-permanent-allocation';
import { TransactionReceipt1744970000000 } from '../migrations/1744970000000-transaction-receipt';
import { CondominiumFees1744980000000 } from '../migrations/1744980000000-condominium-fees';
import { DropFeeAdjustment1744990000000 } from '../migrations/1744990000000-drop-fee-adjustment';
import { PlanningGovernanceDocuments1750000000000 } from '../migrations/1750000000000-planning-governance-documents';
import { PeopleAddress1744700000000 } from '../migrations/1744700000000-people-address';
import { UsersPhoneSmsLogin1744600000000 } from '../migrations/1744600000000-users-phone-sms-login';
import { FinancialFund } from '../finance/entities/financial-fund.entity';
import { FinancialTransaction } from '../finance/entities/financial-transaction.entity';
import { TransactionUnitShare } from '../finance/entities/transaction-unit-share.entity';
import { FundMonthlyAccrual } from '../finance/entities/fund-monthly-accrual.entity';
import { CondominiumFeeCharge } from '../finance/entities/condominium-fee-charge.entity';
import { User } from '../users/user.entity';
import { resolveTypeOrmConnectionOptions } from './connection-credentials';

loadEnv({ path: '.env' });

const get = (key: string) => process.env[key];

export const AppDataSource = new DataSource({
  ...(resolveTypeOrmConnectionOptions(get) as unknown as DataSourceOptions),
  entities: [
    User,
    Condominium,
    Grouping,
    Unit,
    Person,
    UnitInvitation,
    LoginSmsChallenge,
    PasswordResetChallenge,
    FinancialFund,
    FinancialTransaction,
    TransactionUnitShare,
    FundMonthlyAccrual,
    CondominiumFeeCharge,
  ],
  migrations: [
    InitialSchema1744300000000,
    UnitPersonsAndInvitations1744500000000,
    UsersPhoneSmsLogin1744600000000,
    PeopleAddress1744700000000,
    Financial1744850000000,
    PasswordResetChallenges1744900000000,
    FinancialFundPeriod1744950000000,
    FundsPermanentAllocation1744960000000,
    TransactionReceipt1744970000000,
    CondominiumFees1744980000000,
    DropFeeAdjustment1744990000000,
    PlanningGovernanceDocuments1750000000000,
  ],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
});
