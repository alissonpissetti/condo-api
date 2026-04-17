import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CondominiumsModule } from '../condominiums/condominiums.module';
import { UsersModule } from '../users/users.module';
import { Condominium } from '../condominiums/condominium.entity';
import { Grouping } from '../groupings/grouping.entity';
import { Person } from '../people/person.entity';
import { Unit } from '../units/unit.entity';
import { UnitResponsiblePerson } from '../units/unit-responsible-person.entity';
import { CondominiumDocument } from './entities/condominium-document.entity';
import { CondominiumParticipant } from './entities/condominium-participant.entity';
import { GovernanceAuditLog } from './entities/governance-audit-log.entity';
import { PlanningPollAttachment } from './entities/planning-poll-attachment.entity';
import { PlanningPollOption } from './entities/planning-poll-option.entity';
import { PlanningPollVote } from './entities/planning-poll-vote.entity';
import { PlanningPoll } from './entities/planning-poll.entity';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { PlanningDocumentsController } from './planning-documents.controller';
import { PlanningDocumentsService } from './planning-documents.service';
import { PlanningPollsController } from './planning-polls.controller';
import { PlanningPollsService } from './planning-polls.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CondominiumParticipant,
      GovernanceAuditLog,
      PlanningPoll,
      PlanningPollAttachment,
      PlanningPollOption,
      PlanningPollVote,
      CondominiumDocument,
      Condominium,
      Grouping,
      Unit,
      UnitResponsiblePerson,
      Person,
    ]),
    CondominiumsModule,
    UsersModule,
  ],
  controllers: [
    GovernanceController,
    PlanningPollsController,
    PlanningDocumentsController,
  ],
  providers: [GovernanceService, PlanningPollsService, PlanningDocumentsService],
  exports: [GovernanceService],
})
export class PlanningModule {}
