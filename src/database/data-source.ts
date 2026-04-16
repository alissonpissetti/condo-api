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
import { PlanningPollMultipleChoice1750050000000 } from '../migrations/1750050000000-planning-poll-multiple-choice';
import { PlanningPollAttachments1750100000000 } from '../migrations/1750100000000-planning-poll-attachments';
import { CondominiumInvitations1750150000000 } from '../migrations/1750150000000-condominium-invitations';
import { CondominiumInvitationsUnit1750160000000 } from '../migrations/1750160000000-condominium-invitations-unit';
import { CondominiumInvitationPlainToken1750170000000 } from '../migrations/1750170000000-condominium-invitation-plain-token';
import { UsersPlatformAdmin1750200000000 } from '../migrations/1750200000000-users-platform-admin';
import { SaasBilling1750210000000 } from '../migrations/1750210000000-saas-billing';
import { SaasPlans1750220000000 } from '../migrations/1750220000000-saas-plans';
import { SaasUserVouchers1750230000000 } from '../migrations/1750230000000-saas-user-vouchers';
import { SaasVouchersCatalog1750240000000 } from '../migrations/1750240000000-saas-vouchers-catalog';
import { SaasBillingDueDay1750250000000 } from '../migrations/1750250000000-saas-billing-due-day';
import { CondominiumSaasPlan1750260000000 } from '../migrations/1750260000000-condominium-saas-plan';
import { SaasPlanCatalogBlurb1750270000000 } from '../migrations/1750270000000-saas-plan-catalog-blurb';
import { SaasPlanPeriodsChangeRequests1750280000000 } from '../migrations/1750280000000-saas-plan-periods-change-requests';
import { SaasPlanUnitPriceTiers1750290000000 } from '../migrations/1750290000000-saas-plan-unit-price-tiers';
import { TransactionRecurringSeries1750300000000 } from '../migrations/1750300000000-transaction-recurring-series';
import { CondominiumBillingContact1750310000000 } from '../migrations/1750310000000-condominium-billing-contact';
import { CondominiumManagementLogo1750320000000 } from '../migrations/1750320000000-condominium-management-logo';
import { UnitMemberDisplayNames1750330000000 } from '../migrations/1750330000000-unit-member-display-names';
import { DropCondominiumDocumentMembersNote1750350000000 } from '../migrations/1750350000000-drop-condominium-document-members-note';
import { PeopleAddress1744700000000 } from '../migrations/1744700000000-people-address';
import { UsersPhoneSmsLogin1744600000000 } from '../migrations/1744600000000-users-phone-sms-login';
import { FinancialFund } from '../finance/entities/financial-fund.entity';
import { FinancialTransaction } from '../finance/entities/financial-transaction.entity';
import { TransactionUnitShare } from '../finance/entities/transaction-unit-share.entity';
import { FundMonthlyAccrual } from '../finance/entities/fund-monthly-accrual.entity';
import { CondominiumFeeCharge } from '../finance/entities/condominium-fee-charge.entity';
import { SaasCharge } from '../platform/entities/saas-charge.entity';
import { SaasCondominiumBilling } from '../platform/entities/saas-condominium-billing.entity';
import { SaasPlan } from '../platform/entities/saas-plan.entity';
import { SaasVoucher } from '../platform/entities/saas-voucher.entity';
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
    SaasCondominiumBilling,
    SaasCharge,
    SaasPlan,
    SaasVoucher,
  ],
  /** Cada migration em `src/migrations` precisa ser importada e incluída aqui; o CLI não varre a pasta sozinho. */
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
    PlanningPollMultipleChoice1750050000000,
    PlanningPollAttachments1750100000000,
    CondominiumInvitations1750150000000,
    CondominiumInvitationsUnit1750160000000,
    CondominiumInvitationPlainToken1750170000000,
    UsersPlatformAdmin1750200000000,
    SaasBilling1750210000000,
    SaasPlans1750220000000,
    SaasUserVouchers1750230000000,
    SaasVouchersCatalog1750240000000,
    SaasBillingDueDay1750250000000,
    CondominiumSaasPlan1750260000000,
    SaasPlanCatalogBlurb1750270000000,
    SaasPlanPeriodsChangeRequests1750280000000,
    SaasPlanUnitPriceTiers1750290000000,
    TransactionRecurringSeries1750300000000,
    CondominiumBillingContact1750310000000,
    CondominiumManagementLogo1750320000000,
    UnitMemberDisplayNames1750330000000,
    DropCondominiumDocumentMembersNote1750350000000,
  ],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
});
