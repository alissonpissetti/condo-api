import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { In, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { GovernanceService } from '../planning/governance.service';
import { Person } from '../people/person.entity';
import { User } from '../users/user.entity';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportTicketMessage } from './entities/support-ticket-message.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportTicketStatus } from './enums/support-ticket-status.enum';

export type PlatformSupportTicketItem = {
  id: string;
  userId: string;
  userEmail: string;
  userPhone: string | null;
  userFullName: string | null;
  condominiumId: string | null;
  condominiumName: string | null;
  category: string;
  title: string;
  body: string;
  status: SupportTicketStatus;
  createdAt: Date;
  updatedAt: Date;
  /** URL para o cliente acompanhar (se `FRONTEND_PUBLIC_URL` estiver definida). */
  clientFollowUrl: string | null;
};

export type SupportTicketMessageView = {
  id: string;
  body: string;
  createdAt: Date;
  fromPlatformAdmin: boolean;
  authorUserId: string;
  authorEmail?: string;
};

export type SupportConversationUser = {
  ticket: {
    id: string;
    userId: string;
    condominiumId: string | null;
    condominiumName: string | null;
    category: string;
    title: string;
    body: string;
    status: SupportTicketStatus;
    createdAt: Date;
    updatedAt: Date;
  };
  messages: SupportTicketMessageView[];
};

export type SupportConversationPublic = {
  ticket: {
    id: string;
    title: string;
    body: string;
    status: SupportTicketStatus;
    category: string;
    createdAt: Date;
    condominiumName: string | null;
  };
  messages: Pick<
    SupportTicketMessageView,
    'id' | 'body' | 'createdAt' | 'fromPlatformAdmin'
  >[];
};

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(SupportTicketMessage)
    private readonly messageRepo: Repository<SupportTicketMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly governance: GovernanceService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
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
      viewToken: randomBytes(32).toString('hex'),
    });
    const saved = await this.ticketRepo.save(row);
    return this.stripTicketForUser(saved);
  }

  async listMine(userId: string): Promise<SupportTicket[]> {
    const rows = await this.ticketRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((t) => this.stripTicketForUser(t));
  }

  async getMine(userId: string, id: string): Promise<SupportTicket> {
    const t = await this.ticketRepo.findOne({ where: { id, userId } });
    if (!t) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    return this.stripTicketForUser(t);
  }

  async getConversationForUser(
    userId: string,
    ticketId: string,
  ): Promise<SupportConversationUser> {
    const t = await this.ticketRepo.findOne({
      where: { id: ticketId, userId },
      relations: { condominium: true },
    });
    if (!t) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    const messages = await this.loadMessagesOrdered(ticketId);
    const withAuthors = await this.attachAuthorEmails(messages, false);
    return {
      ticket: {
        id: t.id,
        userId: t.userId,
        condominiumId: t.condominiumId,
        condominiumName: t.condominium?.name ?? null,
        category: t.category,
        title: t.title,
        body: t.body,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      },
      messages: withAuthors,
    };
  }

  async postMessageFromUser(
    userId: string,
    ticketId: string,
    body: string,
  ): Promise<SupportConversationUser> {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId, userId } });
    if (!t) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    if (t.status === SupportTicketStatus.Closed) {
      throw new BadRequestException('Este chamado está encerrado.');
    }
    await this.insertMessage(ticketId, userId, false, body.trim());
    return this.getConversationForUser(userId, ticketId);
  }

  async getPublicConversation(
    ticketId: string,
    viewToken: string,
  ): Promise<SupportConversationPublic> {
    const t = await this.ticketRepo.findOne({
      where: { id: ticketId },
      relations: { condominium: true },
    });
    if (!t || !this.tokensEqual(t.viewToken, viewToken)) {
      throw new NotFoundException('Chamado não encontrado ou link inválido.');
    }
    const messages = await this.loadMessagesOrdered(ticketId);
    return {
      ticket: {
        id: t.id,
        title: t.title,
        body: t.body,
        status: t.status,
        category: t.category,
        createdAt: t.createdAt,
        condominiumName: t.condominium?.name ?? null,
      },
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        fromPlatformAdmin: m.fromPlatformAdmin,
      })),
    };
  }

  async getConversationForPlatform(ticketId: string): Promise<{
    ticket: PlatformSupportTicketItem;
    messages: SupportTicketMessageView[];
  }> {
    const ticket = await this.getForPlatform(ticketId);
    const messages = await this.loadMessagesOrdered(ticketId);
    const withAuthors = await this.attachAuthorEmails(messages, true);
    return { ticket, messages: withAuthors };
  }

  async postMessageFromPlatform(
    adminUserId: string,
    ticketId: string,
    body: string,
  ): Promise<{
    ticket: PlatformSupportTicketItem;
    messages: SupportTicketMessageView[];
  }> {
    const admin = await this.userRepo.findOne({
      where: { id: adminUserId },
      select: ['id', 'platformAdmin'],
    });
    if (!admin?.platformAdmin) {
      throw new ForbiddenException('Apenas administradores da plataforma.');
    }
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    if (t.status === SupportTicketStatus.Closed) {
      throw new BadRequestException('Este chamado está encerrado.');
    }
    await this.insertMessage(ticketId, adminUserId, true, body.trim());
    if (t.status === SupportTicketStatus.Open) {
      t.status = SupportTicketStatus.InProgress;
      await this.ticketRepo.save(t);
    }
    await this.notifyUserOfPlatformReply(t);
    return this.getConversationForPlatform(ticketId);
  }

  async listForPlatform(
    page: number,
    limit: number,
    status?: SupportTicketStatus,
  ): Promise<{
    items: PlatformSupportTicketItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where = status ? { status } : {};
    const [tickets, total] = await this.ticketRepo.findAndCount({
      where,
      relations: { condominium: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const items = await this.mapTicketsForPlatform(tickets);
    return {
      items,
      total,
      page,
      limit,
    };
  }

  async getForPlatform(ticketId: string): Promise<PlatformSupportTicketItem> {
    const t = await this.ticketRepo.findOne({
      where: { id: ticketId },
      relations: { condominium: true },
    });
    if (!t) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    const [mapped] = await this.mapTicketsForPlatform([t]);
    return mapped;
  }

  async patchStatusForPlatform(
    ticketId: string,
    status: SupportTicketStatus,
  ): Promise<PlatformSupportTicketItem> {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    t.status = status;
    await this.ticketRepo.save(t);
    return this.getForPlatform(ticketId);
  }

  private stripTicketForUser(t: SupportTicket): SupportTicket {
    const out = { ...t } as Record<string, unknown>;
    delete out.viewToken;
    delete out.messages;
    return out as unknown as SupportTicket;
  }

  private tokensEqual(stored: string, provided: string): boolean {
    try {
      const a = Buffer.from(stored, 'hex');
      const b = Buffer.from(provided, 'hex');
      if (a.length !== b.length || a.length !== 32) {
        return false;
      }
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private async loadMessagesOrdered(
    ticketId: string,
  ): Promise<SupportTicketMessage[]> {
    return this.messageRepo.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
  }

  private async insertMessage(
    ticketId: string,
    authorUserId: string,
    fromPlatformAdmin: boolean,
    body: string,
  ): Promise<void> {
    const row = this.messageRepo.create({
      id: randomUUID(),
      ticketId,
      authorUserId,
      fromPlatformAdmin,
      body,
    });
    await this.messageRepo.save(row);
  }

  private async attachAuthorEmails(
    messages: SupportTicketMessage[],
    includeEmail: boolean,
  ): Promise<SupportTicketMessageView[]> {
    if (!includeEmail) {
      return messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        fromPlatformAdmin: m.fromPlatformAdmin,
        authorUserId: m.authorUserId,
      }));
    }
    if (messages.length === 0) {
      return [];
    }
    const ids = [...new Set(messages.map((m) => m.authorUserId))];
    const rows =
      ids.length > 0
        ? await this.userRepo
            .createQueryBuilder('u')
            .select('u.id', 'id')
            .addSelect('u.email', 'email')
            .where('u.id IN (:...ids)', { ids })
            .getRawMany<{ id: string; email: string }>()
        : [];
    const emailById = new Map(rows.map((r) => [r.id, r.email]));
    return messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      fromPlatformAdmin: m.fromPlatformAdmin,
      authorUserId: m.authorUserId,
      authorEmail: emailById.get(m.authorUserId),
    }));
  }

  private async notifyUserOfPlatformReply(t: SupportTicket): Promise<void> {
    const userRow = await this.userRepo
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .addSelect('u.email', 'email')
      .where('u.id = :id', { id: t.userId })
      .getRawOne<{ id: string; email: string }>();
    const to = userRow?.email?.trim();
    if (!to) {
      return;
    }
    const base =
      this.config.get<string>('FRONTEND_PUBLIC_URL')?.trim()?.replace(/\/$/, '') ??
      '';
    const followUrl = base
      ? `${base}/suporte/chamado/${encodeURIComponent(t.id)}?vt=${encodeURIComponent(t.viewToken)}`
      : '';
    const lastMsg = await this.messageRepo.findOne({
      where: { ticketId: t.id, fromPlatformAdmin: true },
      order: { createdAt: 'DESC' },
    });
    await this.mail.sendSupportTicketReply({
      to,
      ticketTitle: t.title,
      followUrl: followUrl || '(configure FRONTEND_PUBLIC_URL na API para gerar o link)',
      replyPreview: lastMsg?.body ?? '',
    });
  }

  private async mapTicketsForPlatform(
    tickets: SupportTicket[],
  ): Promise<PlatformSupportTicketItem[]> {
    const userIds = [...new Set(tickets.map((t) => t.userId))];
    const userRows =
      userIds.length > 0
        ? await this.userRepo
            .createQueryBuilder('u')
            .select('u.id', 'id')
            .addSelect('u.email', 'email')
            .addSelect('u.phone', 'phone')
            .where('u.id IN (:...ids)', { ids: userIds })
            .getRawMany<{ id: string; email: string; phone: string | null }>()
        : [];
    const userMap = new Map(userRows.map((r) => [r.id, r]));
    const persons =
      userIds.length > 0
        ? await this.personRepo.find({ where: { userId: In(userIds) } })
        : [];
    const nameByUser = new Map<string, string>();
    for (const p of persons) {
      if (p.userId) {
        nameByUser.set(p.userId, p.fullName);
      }
    }
    const base =
      this.config.get<string>('FRONTEND_PUBLIC_URL')?.trim()?.replace(/\/$/, '') ??
      null;
    return tickets.map((t) => {
      const u = userMap.get(t.userId);
      const clientFollowUrl = base
        ? `${base}/suporte/chamado/${encodeURIComponent(t.id)}?vt=${encodeURIComponent(t.viewToken)}`
        : null;
      return {
        id: t.id,
        userId: t.userId,
        userEmail: u?.email ?? '',
        userPhone: u?.phone ?? null,
        userFullName: nameByUser.get(t.userId) ?? null,
        condominiumId: t.condominiumId,
        condominiumName: t.condominium?.name ?? null,
        category: t.category,
        title: t.title,
        body: t.body,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        clientFollowUrl,
      };
    });
  }
}
