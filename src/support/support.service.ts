import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { GovernanceService } from '../planning/governance.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportTicketStatus } from './enums/support-ticket-status.enum';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    private readonly governance: GovernanceService,
  ) {}

  async create(userId: string, dto: CreateSupportTicketDto): Promise<SupportTicket> {
    const condoId = dto.condominiumId?.trim() || null;
    if (condoId) {
      await this.governance.assertAnyAccess(condoId, userId);
    }
    const row = this.ticketRepo.create({
      id: randomUUID(),
      userId,
      condominiumId: condoId,
      category: dto.category,
      title: dto.title.trim(),
      body: dto.body.trim(),
      status: SupportTicketStatus.Open,
    });
    return this.ticketRepo.save(row);
  }

  async listMine(userId: string): Promise<SupportTicket[]> {
    return this.ticketRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async getMine(userId: string, id: string): Promise<SupportTicket> {
    const t = await this.ticketRepo.findOne({ where: { id, userId } });
    if (!t) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    return t;
  }
}
