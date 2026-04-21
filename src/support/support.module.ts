import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { MailModule } from '../mail/mail.module';
import { Person } from '../people/person.entity';
import { PlanningModule } from '../planning/planning.module';
import { User } from '../users/user.entity';
import { SupportTicketMessage } from './entities/support-ticket-message.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportPublicController } from './support-public.controller';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportService } from './support.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupportTicket,
      SupportTicketMessage,
      User,
      Condominium,
      Person,
    ]),
    PlanningModule,
    MailModule,
  ],
  controllers: [SupportTicketsController, SupportPublicController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
