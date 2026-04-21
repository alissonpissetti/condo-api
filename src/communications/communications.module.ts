import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { MailModule } from '../mail/mail.module';
import { ComteleModule } from '../plugins/comtele/comtele.module';
import { PlanningModule } from '../planning/planning.module';
import { Unit } from '../units/unit.entity';
import { Person } from '../people/person.entity';
import { User } from '../users/user.entity';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { PublicCommunicationReadController } from './public-communication-read.controller';
import { CommunicationAttachment } from './entities/communication-attachment.entity';
import { CommunicationReadAccessLog } from './entities/communication-read-access-log.entity';
import { CommunicationReadLink } from './entities/communication-read-link.entity';
import { CommunicationRecipient } from './entities/communication-recipient.entity';
import { Communication } from './entities/communication.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Communication,
      CommunicationAttachment,
      CommunicationRecipient,
      CommunicationReadLink,
      CommunicationReadAccessLog,
      Condominium,
      User,
      Unit,
      Person,
    ]),
    PlanningModule,
    MailModule,
    ComteleModule,
  ],
  controllers: [CommunicationsController, PublicCommunicationReadController],
  providers: [CommunicationsService],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
