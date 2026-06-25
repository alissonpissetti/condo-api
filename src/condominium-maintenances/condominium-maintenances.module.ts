import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Person } from '../people/person.entity';
import { PlanningModule } from '../planning/planning.module';
import { User } from '../users/user.entity';
import { FinancialTransaction } from '../finance/entities/financial-transaction.entity';
import { CondominiumWorksModule } from '../condominium-works/condominium-works.module';
import { CondominiumMaintenancesController } from './condominium-maintenances.controller';
import { CondominiumMaintenancesService } from './condominium-maintenances.service';
import { CondominiumMaintenanceTimelineAttachment } from './entities/condominium-maintenance-timeline-attachment.entity';
import { CondominiumMaintenanceTimelineEntry } from './entities/condominium-maintenance-timeline-entry.entity';
import { CondominiumMaintenance } from './entities/condominium-maintenance.entity';
import { MaintenanceTransactionLinkService } from './maintenance-transaction-link.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CondominiumMaintenance,
      CondominiumMaintenanceTimelineEntry,
      CondominiumMaintenanceTimelineAttachment,
      FinancialTransaction,
      Person,
      User,
    ]),
    PlanningModule,
    CondominiumWorksModule,
  ],
  controllers: [CondominiumMaintenancesController],
  providers: [
    CondominiumMaintenancesService,
    MaintenanceTransactionLinkService,
  ],
  exports: [MaintenanceTransactionLinkService],
})
export class CondominiumMaintenancesModule {}
