import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Express } from 'express';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { In, Repository } from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { MailService } from '../mail/mail.service';
import { GovernanceService } from '../planning/governance.service';
import { Person } from '../people/person.entity';
import { User } from '../users/user.entity';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportTicketMessage } from './entities/support-ticket-message.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportTicketCategory } from './enums/support-ticket-category.enum';
import { SupportTicketStatus } from './enums/support-ticket-status.enum';
import { SupportTicketTarget } from './enums/support-ticket-target.enum';
import { SupportAttachmentStorageService } from './support-attachment-storage.service';
import type { SupportTicketAttachmentMeta } from './support-attachment.types';

export type PlatformSupportTicketItem = {
  id: string;
  userId: string;
  userEmail: string;
  userPhone: string | null;
  userFullName: string | null;
  target: SupportTicketTarget;
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
  attachments: SupportTicketAttachmentMeta[];
};

export type SupportConversationUser = {
  ticket: {
    id: string;
    userId: string;
    target: SupportTicketTarget;
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
    target: SupportTicketTarget;
    category: string;
    createdAt: Date;
    condominiumName: string | null;
  };
  messages: Pick<
    SupportTicketMessageView,
    'id' | 'body' | 'createdAt' | 'fromPlatformAdmin' | 'attachments'
  >[];
};

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(SupportTicketMessage)
    private readonly messageRepo: Repository<SupportTicketMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    private readonly governance: GovernanceService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly supportAttachmentStorage: SupportAttachmentStorageService,
  ) {}

  async create(
    userId: string,
    dto: CreateSupportTicketDto,
    files?: Express.Multer.File[],
  ): Promise<SupportTicket> {
    this.assertCategoryMatchesTarget(dto.target, dto.category);
    const condoId = dto.condominiumId?.trim() || null;
    if (dto.target === SupportTicketTarget.Condominium && !condoId) {
      throw new BadRequestException(
        'Para solicitação ao condomínio, selecione o condomínio.',
      );
    }
    if (condoId) {
      await this.governance.assertAnyAccess(condoId, userId);
    }
    const trimmedTitle = dto.title.trim();
    const trimmedBody = (dto.body ?? '').trim();
    const fileList = files ?? [];
    if (trimmedTitle.length < 3) {
      throw new BadRequestException('Assunto muito curto (mín. 3 caracteres).');
    }
    if (trimmedBody.length > 50000) {
      throw new BadRequestException(
        'Descrição muito longa (máx. 50000 caracteres).',
      );
    }
    if (trimmedBody.length < 10 && fileList.length === 0) {
      throw new BadRequestException(
        'Escreva pelo menos 10 caracteres na descrição ou anexe arquivos.',
      );
    }
    const ticketBody =
      trimmedBody.length > 0
        ? trimmedBody
        : 'Detalhes nos arquivos anexados na primeira mensagem da conversa.';
    const row = this.ticketRepo.create({
      id: randomUUID(),
      userId,
      target: dto.target,
      condominiumId: condoId,
      category: dto.category,
      title: trimmedTitle,
      body: ticketBody,
      status: SupportTicketStatus.Open,
      viewToken: randomBytes(32).toString('hex'),
    });
    const saved = await this.ticketRepo.save(row);
    if (fileList.length > 0) {
      const metas = await this.supportAttachmentStorage.saveMany(
        saved.id,
        fileList,
      );
      await this.insertMessage(saved.id, userId, false, '', metas);
    }
    if (condoId) {
      try {
        const condo = await this.condoRepo.findOne({
          where: { id: condoId },
          relations: { owner: true },
        });
        if (condo?.owner) {
          const userRow = await this.userRepo.findOne({
            where: { id: userId },
            select: ['id', 'email'],
          });
          const email = userRow?.email?.trim() ?? '';
          if (email) {
            const person = await this.personRepo.findOne({
              where: { userId },
              select: ['fullName'],
            });
            await this.notifySyndicOfNewSupportTicket(
              saved,
              condo,
              email,
              person?.fullName ?? null,
            );
          }
        }
      } catch (err) {
        this.logger.warn(
          `Não foi possível enviar cópia do chamado ${saved.id} ao síndico: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
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
        target: this.normalizeTicketTarget(t),
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
    files: Express.Multer.File[] | undefined,
  ): Promise<SupportConversationUser> {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId, userId } });
    if (!t) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    if (t.status === SupportTicketStatus.Closed) {
      throw new BadRequestException('Este chamado está encerrado.');
    }
    const trimmed = (body ?? '').trim();
    if (trimmed.length > 20000) {
      throw new BadRequestException(
        'Mensagem muito longa (máx. 20000 caracteres).',
      );
    }
    const fileList = files ?? [];
    if (!trimmed.length && !fileList.length) {
      throw new BadRequestException(
        'Escreva uma mensagem ou anexe pelo menos um arquivo.',
      );
    }
    const metas = fileList.length
      ? await this.supportAttachmentStorage.saveMany(ticketId, fileList)
      : [];
    await this.insertMessage(ticketId, userId, false, trimmed, metas);
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
        target: this.normalizeTicketTarget(t),
        category: t.category,
        createdAt: t.createdAt,
        condominiumName: t.condominium?.name ?? null,
      },
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        fromPlatformAdmin: m.fromPlatformAdmin,
        attachments: this.parseMessageAttachments(m),
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
    files: Express.Multer.File[] | undefined,
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
    const trimmed = (body ?? '').trim();
    if (trimmed.length > 20000) {
      throw new BadRequestException(
        'Mensagem muito longa (máx. 20000 caracteres).',
      );
    }
    const fileList = files ?? [];
    if (!trimmed.length && !fileList.length) {
      throw new BadRequestException(
        'Escreva uma mensagem ou anexe pelo menos um arquivo.',
      );
    }
    const metas = fileList.length
      ? await this.supportAttachmentStorage.saveMany(ticketId, fileList)
      : [];
    await this.insertMessage(ticketId, adminUserId, true, trimmed, metas);
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

  private normalizeTicketTarget(t: SupportTicket): SupportTicketTarget {
    return t.target === SupportTicketTarget.Condominium
      ? SupportTicketTarget.Condominium
      : SupportTicketTarget.Platform;
  }

  private assertCategoryMatchesTarget(
    target: SupportTicketTarget,
    category: SupportTicketCategory,
  ): void {
    const platform = new Set<SupportTicketCategory>([
      SupportTicketCategory.Bug,
      SupportTicketCategory.Correction,
      SupportTicketCategory.Feature,
      SupportTicketCategory.Improvement,
      SupportTicketCategory.Other,
    ]);
    const condo = new Set<SupportTicketCategory>([
      SupportTicketCategory.CondoComplaint,
      SupportTicketCategory.CondoRequest,
      SupportTicketCategory.CondoOrder,
      SupportTicketCategory.CondoInformation,
      SupportTicketCategory.CondoAgendaSuggestion,
      SupportTicketCategory.CondoOther,
    ]);
    if (target === SupportTicketTarget.Platform) {
      if (!platform.has(category)) {
        throw new BadRequestException(
          'Categoria inválida para solicitação à plataforma.',
        );
      }
    } else if (!condo.has(category)) {
      throw new BadRequestException(
        'Categoria inválida para solicitação ao condomínio.',
      );
    }
  }

  private supportCategoryLabelPt(cat: SupportTicketCategory): string {
    const map: Record<SupportTicketCategory, string> = {
      [SupportTicketCategory.Bug]: 'Erro / comportamento inesperado',
      [SupportTicketCategory.Correction]: 'Correção de dados ou texto',
      [SupportTicketCategory.Improvement]: 'Melhoria em algo existente',
      [SupportTicketCategory.Feature]: 'Nova funcionalidade',
      [SupportTicketCategory.Other]: 'Outro',
      [SupportTicketCategory.CondoComplaint]: 'Reclamação',
      [SupportTicketCategory.CondoRequest]: 'Solicitação',
      [SupportTicketCategory.CondoOrder]: 'Pedido',
      [SupportTicketCategory.CondoInformation]: 'Informação',
      [SupportTicketCategory.CondoAgendaSuggestion]:
        'Sugestão de pauta condominial',
      [SupportTicketCategory.CondoOther]: 'Outros',
    };
    return map[cat] ?? String(cat);
  }

  /** E-mail de ciência ao dono do condomínio (síndico), além do fluxo normal da plataforma. */
  private async notifySyndicOfNewSupportTicket(
    ticket: SupportTicket,
    condominium: Condominium,
    requesterEmail: string,
    requesterFullName: string | null,
  ): Promise<void> {
    if (condominium.ownerId === ticket.userId) {
      return;
    }
    const to = condominium.owner.email?.trim();
    if (!to) {
      return;
    }
    if (to.toLowerCase() === requesterEmail.trim().toLowerCase()) {
      return;
    }
    await this.mail.sendSupportTicketOpenedSyndicCopy({
      to,
      condominiumName: condominium.name,
      requesterName: requesterFullName?.trim() || requesterEmail,
      requesterEmail: requesterEmail.trim(),
      categoryLabel: this.supportCategoryLabelPt(ticket.category),
      ticketTitle: ticket.title,
      bodyPreview: ticket.body,
      directedToCondominiumManagement:
        this.normalizeTicketTarget(ticket) === SupportTicketTarget.Condominium,
    });
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
    attachments: SupportTicketAttachmentMeta[] = [],
  ): Promise<void> {
    const row = this.messageRepo.create({
      id: randomUUID(),
      ticketId,
      authorUserId,
      fromPlatformAdmin,
      body,
      attachmentsJson:
        attachments.length > 0 ? JSON.stringify(attachments) : null,
    });
    await this.messageRepo.save(row);
  }

  private parseMessageAttachments(
    m: SupportTicketMessage,
  ): SupportTicketAttachmentMeta[] {
    if (!m.attachmentsJson?.trim()) {
      return [];
    }
    try {
      const data = JSON.parse(m.attachmentsJson) as unknown;
      if (!Array.isArray(data)) {
        return [];
      }
      return data as SupportTicketAttachmentMeta[];
    } catch {
      return [];
    }
  }

  async readAttachmentForUser(
    userId: string,
    ticketId: string,
    storageKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId, userId } });
    if (!t) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    return this.supportAttachmentStorage.read(ticketId, storageKey);
  }

  async readAttachmentPublic(
    ticketId: string,
    viewToken: string,
    storageKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t || !this.tokensEqual(t.viewToken, viewToken)) {
      throw new NotFoundException('Chamado não encontrado ou link inválido.');
    }
    return this.supportAttachmentStorage.read(ticketId, storageKey);
  }

  async readAttachmentForPlatform(
    ticketId: string,
    storageKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!t) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    return this.supportAttachmentStorage.read(ticketId, storageKey);
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
        attachments: this.parseMessageAttachments(m),
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
      attachments: this.parseMessageAttachments(m),
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
        target: this.normalizeTicketTarget(t),
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
