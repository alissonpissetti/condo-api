import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { MailModule } from '../mail/mail.module';
import { ComteleModule } from '../plugins/comtele/comtele.module';
import { PlanningModule } from '../planning/planning.module';
import { User } from '../users/user.entity';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { PublicCommunicationReadController } from './public-communication-read.controller';
import { CommunicationAttachment } from './entities/communication-attachment.entity';
import { CommunicationRecipient } from './entities/communication-recipient.entity';
import { Communication } from './entities/communication.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Communication,
      CommunicationAttachment,
      CommunicationRecipient,
      Condominium,
      User,
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
