import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { MailModule } from '../mail/mail.module';
import { Person } from '../people/person.entity';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { AsaasClientService } from './asaas-client.service';
import { SaasCharge } from './entities/saas-charge.entity';
import { SaasCondominiumBilling } from './entities/saas-condominium-billing.entity';
import { PlatformAdminBootstrapService } from './platform-admin-bootstrap.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAsaasPendingSyncCronService } from './platform-asaas-pending-sync.cron';
import { PlatformAsaasWebhookController } from './platform-asaas-webhook.controller';
import { PlatformBillingAsaasService } from './platform-billing-asaas.service';
import { PlatformController } from './platform.controller';
import { PlatformSaasBillingDailyCronService } from './platform-saas-billing-daily.cron';
import { PlatformService } from './platform.service';
import { PlatformSupportTicketsController } from './platform-support-tickets.controller';
import { SaasPlansModule } from './saas-plans.module';
import { SupportModule } from '../support/support.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Condominium,
      Person,
      SaasCondominiumBilling,
      SaasCharge,
    ]),
    UsersModule,
    SaasPlansModule,
    MailModule,
    SupportModule,
  ],
  controllers: [
    PlatformController,
    PlatformAsaasWebhookController,
    PlatformSupportTicketsController,
  ],
  providers: [
    PlatformService,
    PlatformBillingAsaasService,
    AsaasClientService,
    PlatformAdminGuard,
    PlatformAdminBootstrapService,
    PlatformAsaasPendingSyncCronService,
    PlatformSaasBillingDailyCronService,
  ],
})
export class PlatformModule {}
