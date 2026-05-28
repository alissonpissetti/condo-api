import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Person } from '../people/person.entity';
import { PlanningModule } from '../planning/planning.module';
import { User } from '../users/user.entity';
import { CondominiumWorksController } from './condominium-works.controller';
import { CondominiumWorksService } from './condominium-works.service';
import { CondominiumWorkBudget } from './entities/condominium-work-budget.entity';
import { CondominiumWorkTimelineAttachment } from './entities/condominium-work-timeline-attachment.entity';
import { CondominiumWorkTimelineEntry } from './entities/condominium-work-timeline-entry.entity';
import { CondominiumWork } from './entities/condominium-work.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CondominiumWork,
      CondominiumWorkBudget,
      CondominiumWorkTimelineAttachment,
      CondominiumWorkTimelineEntry,
      Person,
      User,
    ]),
    PlanningModule,
  ],
  controllers: [CondominiumWorksController],
  providers: [CondominiumWorksService],
})
export class CondominiumWorksModule {}
