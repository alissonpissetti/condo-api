import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CondominiumsModule } from '../condominiums/condominiums.module';
import { Grouping } from '../groupings/grouping.entity';
import { MailModule } from '../mail/mail.module';
import { Unit } from '../units/unit.entity';
import { UsersModule } from '../users/users.module';
import { InvitationsController } from './invitations.controller';
import { Person } from './person.entity';
import { PeopleService } from './people.service';
import { UnitInvitation } from './unit-invitation.entity';
import { UnitPeopleController } from './unit-people.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Person, UnitInvitation, Unit, Grouping]),
    CondominiumsModule,
    UsersModule,
    MailModule,
  ],
  controllers: [UnitPeopleController, InvitationsController],
  providers: [PeopleService],
})
export class PeopleModule {}
