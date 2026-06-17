import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Person } from '../people/person.entity';
import { PlanningModule } from '../planning/planning.module';
import { User } from '../users/user.entity';
import { FinancialTransaction } from '../finance/entities/financial-transaction.entity';
import { CondominiumWorksController } from './condominium-works.controller';
import { CondominiumWorksService } from './condominium-works.service';
import { CondominiumSuppliersService } from './condominium-suppliers.service';
import { CondominiumSupplierCategoriesService } from './condominium-supplier-categories.service';
import { CondominiumSupplierCategory } from './entities/condominium-supplier-category.entity';
import { CondominiumSupplier } from './entities/condominium-supplier.entity';
import { CondominiumWorkBudget } from './entities/condominium-work-budget.entity';
import { CondominiumWorkTimelineAttachment } from './entities/condominium-work-timeline-attachment.entity';
import { CondominiumWorkTimelineEntry } from './entities/condominium-work-timeline-entry.entity';
import { CondominiumWork } from './entities/condominium-work.entity';
import { WorkTransactionLinkService } from './work-transaction-link.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CondominiumWork,
      CondominiumSupplier,
      CondominiumSupplierCategory,
      CondominiumWorkBudget,
      CondominiumWorkTimelineAttachment,
      CondominiumWorkTimelineEntry,
      FinancialTransaction,
      Person,
      User,
    ]),
    PlanningModule,
  ],
  controllers: [CondominiumWorksController],
  providers: [
    CondominiumWorksService,
    CondominiumSuppliersService,
    CondominiumSupplierCategoriesService,
    WorkTransactionLinkService,
  ],
  exports: [
    WorkTransactionLinkService,
    CondominiumSuppliersService,
    CondominiumSupplierCategoriesService,
  ],
})
export class CondominiumWorksModule {}
