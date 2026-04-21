import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { PlanningModule } from '../planning/planning.module';
import { User } from '../users/user.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportService } from './support.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket, User, Condominium]),
    PlanningModule,
  ],
  controllers: [SupportTicketsController],
  providers: [SupportService],
})
export class SupportModule {}
