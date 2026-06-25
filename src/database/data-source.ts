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
import { UnitResponsiblePerson } from '../units/unit-responsible-person.entity';
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
import { CondominiumInvitationsEmailOptionalPhone1751350000000 } from '../migrations/1751350000000-condominium-invitations-email-optional-phone';
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
import { TransactionCompetencyRecurrence1750310000000 } from '../migrations/1750310000000-transaction-competency-recurrence';
import { CondominiumManagementLogo1750320000000 } from '../migrations/1750320000000-condominium-management-logo';
import { UnitMemberDisplayNames1750330000000 } from '../migrations/1750330000000-unit-member-display-names';
import { DropCondominiumDocumentMembersNote1750350000000 } from '../migrations/1750350000000-drop-condominium-document-members-note';
import { UnitMultipleResponsibles1750360000000 } from '../migrations/1750360000000-unit-multiple-responsibles';
import { CondominiumTransparencyPixQrcode1750370000000 } from '../migrations/1750370000000-condominium-transparency-pix-qrcode';
import { CondominiumBillingChargeModel1750380000000 } from '../migrations/1750380000000-condominium-billing-charge-model';
import { SaasPlanFeatures1750390000000 } from '../migrations/1750390000000-saas-plan-features';
import { FeeChargePaymentReceipt1750400000000 } from '../migrations/1750400000000-fee-charge-payment-receipt';
import { UserSignaturePng1750410000000 } from '../migrations/1750410000000-user-signature-png';
import { PlanningPollCompetenceDate1750420000000 } from '../migrations/1750420000000-planning-poll-competence-date';
import { Communications1750430000000 } from '../migrations/1750430000000-communications';
import { CommunicationAudienceChannels1751000000000 } from '../migrations/1751000000000-communication-audience-channels';
import { CommunicationReadLinks1751100000000 } from '../migrations/1751100000000-communication-read-links';
import { CommunicationReadAccessLogs1751200000000 } from '../migrations/1751200000000-communication-read-access-logs';
import { CommunicationDisplayNames1751210000000 } from '../migrations/1751210000000-communication-display-names';
import { Suppliers1751430000000 } from '../migrations/1751430000000-suppliers';
import { FinancialTransactionSupplier1751450000000 } from '../migrations/1751450000000-financial-transaction-supplier';
import { CondominiumWorks1751450000000 } from '../migrations/1751450000000-condominium-works';
import { ConstructionWorks1751460000000 } from '../migrations/1751460000000-construction-works';
import { CondominiumWorkBudgetAttachments1751460000000 } from '../migrations/1751460000000-condominium-work-budget-attachments';
import { CondominiumWorkTimelineAttachments1751470000000 } from '../migrations/1751470000000-condominium-work-timeline-attachments';
import { PlanningPollMinutesAndMeetingNotes1751470000000 } from '../migrations/1751470000000-planning-poll-minutes-and-meeting-notes';
import { CondominiumBankAccounts1751480000000 } from '../migrations/1751480000000-condominium-bank-accounts';
import { TransactionBankAccount1751490000000 } from '../migrations/1751490000000-transaction-bank-account';
import { TransactionTransfer1751500000000 } from '../migrations/1751500000000-transaction-transfer';
import { BankAccountInitialBalanceOn1751510000000 } from '../migrations/1751510000000-bank-account-initial-balance-on';
import { TransactionWorkLink1751520000000 } from '../migrations/1751520000000-transaction-work-link';
import { CondominiumWorkQueueOrder1751540000000 } from '../migrations/1751540000000-condominium-work-queue-order';
import { CondominiumSuppliers1751550000000 } from '../migrations/1751550000000-condominium-suppliers';
import { SupplierCategories1751560000000 } from '../migrations/1751560000000-supplier-categories';
import { SupplierContactName1751570000000 } from '../migrations/1751570000000-supplier-contact-name';
import { WorkBudgetScheduledAt1751580000000 } from '../migrations/1751580000000-work-budget-scheduled-at';
import { WorkBudgetTitle1751810000000 } from '../migrations/1751810000000-work-budget-title';
import { CondominiumMaintenances1751820000000 } from '../migrations/1751820000000-condominium-maintenances';
import { CondominiumWorkAllocationRule1751830000000 } from '../migrations/1751830000000-condominium-work-allocation-rule';
import { PlanningPollQuestions1751590000000 } from '../migrations/1751590000000-planning-poll-questions';
import { PlanningPollAbstentions1751610000000 } from '../migrations/1751610000000-planning-poll-abstentions';
import { SupportTickets1751220000000 } from '../migrations/1751220000000-support-tickets';
import { SupportTicketMessagesViewToken1751230000000 } from '../migrations/1751230000000-support-ticket-messages-view-token';
import { SupportTicketTarget1751300000000 } from '../migrations/1751300000000-support-ticket-target';
import { SupportMessageAttachments1751310000000 } from '../migrations/1751310000000-support-message-attachments';
import { CondominiumLibraryDocuments1751320000000 } from '../migrations/1751320000000-condominium-library-documents';
import { CondominiumLibraryDownloadLog1751400000000 } from '../migrations/1751400000000-condominium-library-download-log';
import { TransactionDocument1751330000000 } from '../migrations/1751330000000-transaction-document';
import { TransactionMultiDocuments1751340000000 } from '../migrations/1751340000000-transaction-multi-documents';
import { EnsureTransactionCompetencyColumns1751240000000 } from '../migrations/1751240000000-ensure-transaction-competency-columns';
import { CondominiumFeeChargePaymentLogs1751250000000 } from '../migrations/1751250000000-condominium-fee-charge-payment-logs';
import { UnitsFinancialResponsiblePerson1751260000000 } from '../migrations/1751260000000-units-financial-responsible-person';
import { UnitsPendingWhatsappPhone1751410000000 } from '../migrations/1751410000000-units-pending-whatsapp-phone';
import { FinancialTransactionPaymentStatus1751420000000 } from '../migrations/1751420000000-financial-transaction-payment-status';
import { PeopleAddress1744700000000 } from '../migrations/1744700000000-people-address';
import { UsersPhoneSmsLogin1744600000000 } from '../migrations/1744600000000-users-phone-sms-login';
import { CondominiumLibraryDocument } from '../condominium-library/entities/condominium-library-document.entity';
import { CondominiumLibraryDocumentDownload } from '../condominium-library/entities/condominium-library-document-download.entity';
import { FinancialFund } from '../finance/entities/financial-fund.entity';
import { FinancialTransaction } from '../finance/entities/financial-transaction.entity';
import { TransactionUnitShare } from '../finance/entities/transaction-unit-share.entity';
import { FundMonthlyAccrual } from '../finance/entities/fund-monthly-accrual.entity';
import { CondominiumBankAccount } from '../finance/entities/condominium-bank-account.entity';
import { CondominiumFeeCharge } from '../finance/entities/condominium-fee-charge.entity';
import { CondominiumWork } from '../condominium-works/entities/condominium-work.entity';
import { CondominiumSupplierCategory } from '../condominium-works/entities/condominium-supplier-category.entity';
import { CondominiumSupplier } from '../condominium-works/entities/condominium-supplier.entity';
import { CondominiumWorkBudget } from '../condominium-works/entities/condominium-work-budget.entity';
import { CondominiumWorkTimelineEntry } from '../condominium-works/entities/condominium-work-timeline-entry.entity';
import { CondominiumWorkTimelineAttachment } from '../condominium-works/entities/condominium-work-timeline-attachment.entity';
import { CondominiumMaintenance } from '../condominium-maintenances/entities/condominium-maintenance.entity';
import { CondominiumMaintenanceTimelineEntry } from '../condominium-maintenances/entities/condominium-maintenance-timeline-entry.entity';
import { CondominiumMaintenanceTimelineAttachment } from '../condominium-maintenances/entities/condominium-maintenance-timeline-attachment.entity';
import { SupplierCategory } from '../suppliers/entities/supplier-category.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { ConstructionProjectUpdate } from '../works/entities/construction-project-update.entity';
import { ConstructionProject } from '../works/entities/construction-project.entity';
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
    UnitResponsiblePerson,
    Person,
    UnitInvitation,
    LoginSmsChallenge,
    PasswordResetChallenge,
    FinancialFund,
    SupplierCategory,
    Supplier,
    FinancialTransaction,
    TransactionUnitShare,
    FundMonthlyAccrual,
    CondominiumBankAccount,
    CondominiumFeeCharge,
    CondominiumWork,
    CondominiumSupplier,
    CondominiumSupplierCategory,
    CondominiumWorkBudget,
    CondominiumWorkTimelineEntry,
    CondominiumWorkTimelineAttachment,
    CondominiumMaintenance,
    CondominiumMaintenanceTimelineEntry,
    CondominiumMaintenanceTimelineAttachment,
    ConstructionProject,
    ConstructionProjectUpdate,
    SaasCondominiumBilling,
    SaasCharge,
    SaasPlan,
    SaasVoucher,
    CondominiumLibraryDocument,
    CondominiumLibraryDocumentDownload,
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
    TransactionCompetencyRecurrence1750310000000,
    CondominiumManagementLogo1750320000000,
    UnitMemberDisplayNames1750330000000,
    DropCondominiumDocumentMembersNote1750350000000,
    UnitMultipleResponsibles1750360000000,
    CondominiumTransparencyPixQrcode1750370000000,
    CondominiumBillingChargeModel1750380000000,
    SaasPlanFeatures1750390000000,
    FeeChargePaymentReceipt1750400000000,
    UserSignaturePng1750410000000,
    PlanningPollCompetenceDate1750420000000,
    Communications1750430000000,
    CommunicationAudienceChannels1751000000000,
    CommunicationReadLinks1751100000000,
    CommunicationReadAccessLogs1751200000000,
    CommunicationDisplayNames1751210000000,
    SupportTickets1751220000000,
    SupportTicketMessagesViewToken1751230000000,
    SupportTicketTarget1751300000000,
    SupportMessageAttachments1751310000000,
    CondominiumLibraryDocuments1751320000000,
    CondominiumLibraryDownloadLog1751400000000,
    TransactionDocument1751330000000,
    TransactionMultiDocuments1751340000000,
    CondominiumInvitationsEmailOptionalPhone1751350000000,
    EnsureTransactionCompetencyColumns1751240000000,
    CondominiumFeeChargePaymentLogs1751250000000,
    UnitsFinancialResponsiblePerson1751260000000,
    UnitsPendingWhatsappPhone1751410000000,
    FinancialTransactionPaymentStatus1751420000000,
    Suppliers1751430000000,
    FinancialTransactionSupplier1751450000000,
    CondominiumWorks1751450000000,
    ConstructionWorks1751460000000,
    CondominiumWorkBudgetAttachments1751460000000,
    CondominiumWorkTimelineAttachments1751470000000,
    PlanningPollMinutesAndMeetingNotes1751470000000,
    CondominiumBankAccounts1751480000000,
    TransactionBankAccount1751490000000,
    TransactionTransfer1751500000000,
    BankAccountInitialBalanceOn1751510000000,
    TransactionWorkLink1751520000000,
    CondominiumWorkQueueOrder1751540000000,
    CondominiumSuppliers1751550000000,
    SupplierCategories1751560000000,
    SupplierContactName1751570000000,
    WorkBudgetScheduledAt1751580000000,
    WorkBudgetTitle1751810000000,
    CondominiumMaintenances1751820000000,
    CondominiumWorkAllocationRule1751830000000,
    PlanningPollQuestions1751590000000,
    PlanningPollAbstentions1751610000000,
  ],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
});
