import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { CondominiumsModule } from '../condominiums/condominiums.module';
import { PlanningModule } from '../planning/planning.module';
import { Grouping } from '../groupings/grouping.entity';
import { MailModule } from '../mail/mail.module';
import { Unit } from '../units/unit.entity';
import { UnitResponsiblePerson } from '../units/unit-responsible-person.entity';
import { SaasPlansModule } from '../platform/saas-plans.module';
import { UsersModule } from '../users/users.module';
import { CondominiumInvitation } from './condominium-invitation.entity';
import { CondominiumInvitationsController } from './condominium-invitations.controller';
import { InvitationsController } from './invitations.controller';
import { Person } from './person.entity';
import { PeopleService } from './people.service';
import { UnitInvitation } from './unit-invitation.entity';
import { UnitPeopleController } from './unit-people.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Person,
      UnitInvitation,
      CondominiumInvitation,
      Unit,
      UnitResponsiblePerson,
      Grouping,
      Condominium,
    ]),
    CondominiumsModule,
    PlanningModule,
    UsersModule,
    SaasPlansModule,
    MailModule,
  ],
  controllers: [
    UnitPeopleController,
    InvitationsController,
    CondominiumInvitationsController,
  ],
  providers: [PeopleService],
})
export class PeopleModule {}
