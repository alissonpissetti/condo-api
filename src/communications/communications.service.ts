import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type { Express } from 'express';
import { In, Repository } from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { normalizeBrCellphone } from '../lib/phone-br';
import { MailService } from '../mail/mail.service';
import { ComteleService } from '../plugins/comtele/comtele.service';
import { GovernanceService, type CondoAccess } from '../planning/governance.service';
import { sanitizePollBodyRich } from '../planning/poll-body-sanitize';
import {
  normalizeMulterOriginalName,
  repairMojibakeUtf8Filename,
} from '../planning/upload-filename-encoding.util';
import { GovernanceRole } from '../planning/enums/governance-role.enum';
import { User } from '../users/user.entity';
import { CommunicationAttachmentStorageHelper } from './communication-attachment-storage.helper';
import { ConfirmReadDto } from './dto/confirm-read.dto';
import { CreateCommunicationDto } from './dto/create-communication.dto';
import { UpdateCommunicationDto } from './dto/update-communication.dto';
import { CommunicationAttachment } from './entities/communication-attachment.entity';
import { CommunicationRecipient } from './entities/communication-recipient.entity';
import { Communication } from './entities/communication.entity';
import { CommunicationStatus } from './enums/communication-status.enum';
import { DeliveryChannelStatus } from './enums/delivery-channel-status.enum';
import { CommunicationReadSource } from './enums/read-source.enum';

@Injectable()
export class CommunicationsService {
  private readonly logger = new Logger(CommunicationsService.name);
  private readonly storage: CommunicationAttachmentStorageHelper;

  constructor(
    @InjectRepository(Communication)
    private readonly commRepo: Repository<Communication>,
    @InjectRepository(CommunicationAttachment)
    private readonly attRepo: Repository<CommunicationAttachment>,
    @InjectRepository(CommunicationRecipient)
    private readonly recRepo: Repository<CommunicationRecipient>,
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly governance: GovernanceService,
    private readonly mail: MailService,
    private readonly comtele: ComteleService,
    private readonly config: ConfigService,
  ) {
    this.storage = new CommunicationAttachmentStorageHelper(config);
  }

  private apiPublicBase(): string {
    const raw =
      this.config.get<string>('API_PUBLIC_BASE_URL')?.trim() ||
      this.config.get<string>('BACKEND_PUBLIC_URL')?.trim();
    return raw?.replace(/\/$/, '') ?? '';
  }

  private frontendBase(): string {
    return (
      this.config.get<string>('FRONTEND_PUBLIC_URL')?.trim()?.replace(/\/$/, '') ??
      ''
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private isManagement(access: CondoAccess): boolean {
    if (access.kind === 'resident') return false;
    if (access.kind === 'owner') return true;
    if (access.kind !== 'participant') return false;
    return (
      access.role === GovernanceRole.Syndic ||
      access.role === GovernanceRole.SubSyndic ||
      access.role === GovernanceRole.Admin
    );
  }

  private async loadAudienceUsers(condominiumId: string): Promise<User[]> {
    const ids = await this.governance.listCommunicationAudienceUserIds(
      condominiumId,
    );
    if (ids.length === 0) {
      return [];
    }
    return this.userRepo.findBy({ id: In(ids) });
  }

  async list(condominiumId: string, userId: string) {
    const access = await this.governance.assertAnyAccess(condominiumId, userId);
    const isMgmt = this.isManagement(access);

    if (isMgmt) {
      return this.commRepo.find({
        where: { condominiumId },
        order: { createdAt: 'DESC' },
        relations: { attachments: true },
      });
    }

    return this.commRepo
      .createQueryBuilder('c')
      .innerJoin(
        'communication_recipients',
        'r',
        'r.communication_id = c.id AND r.user_id = :uid',
        { uid: userId },
      )
      .where('c.condominium_id = :cid', { cid: condominiumId })
      .andWhere('c.status = :st', { st: CommunicationStatus.Sent })
      .orderBy('c.sent_at', 'DESC')
      .leftJoinAndSelect('c.attachments', 'attachments')
      .getMany();
  }

  async create(condominiumId: string, userId: string, dto: CreateCommunicationDto) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const c = this.commRepo.create({
      id: randomUUID(),
      condominiumId,
      title: dto.title.trim(),
      body: sanitizePollBodyRich(dto.body) ?? null,
      status: CommunicationStatus.Draft,
      createdByUserId: userId,
      sentAt: null,
    });
    return this.commRepo.save(c);
  }

  async update(
    condominiumId: string,
    id: string,
    userId: string,
    dto: UpdateCommunicationDto,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const c = await this.requireDraft(condominiumId, id);
    if (dto.title !== undefined) {
      c.title = dto.title.trim();
    }
    if (dto.body !== undefined) {
      c.body = sanitizePollBodyRich(dto.body) ?? null;
    }
    return this.commRepo.save(c);
  }

  private async requireDraft(
    condominiumId: string,
    id: string,
  ): Promise<Communication> {
    const c = await this.commRepo.findOne({
      where: { id, condominiumId },
      relations: { attachments: true },
    });
    if (!c) {
      throw new NotFoundException('Informativo não encontrado.');
    }
    if (c.status !== CommunicationStatus.Draft) {
      throw new BadRequestException('Só é possível editar informativos em rascunho.');
    }
    return c;
  }

  async requireCommunication(
    condominiumId: string,
    id: string,
  ): Promise<Communication> {
    const c = await this.commRepo.findOne({
      where: { id, condominiumId },
      relations: { attachments: true, recipients: true },
    });
    if (!c) {
      throw new NotFoundException('Informativo não encontrado.');
    }
    return c;
  }

  async getOne(condominiumId: string, commId: string, userId: string) {
    const access = await this.governance.assertAnyAccess(condominiumId, userId);
    const c = await this.requireCommunication(condominiumId, commId);
    const isMgmt = this.isManagement(access);

    if (!isMgmt) {
      if (c.status !== CommunicationStatus.Sent) {
        throw new ForbiddenException('Informativo indisponível.');
      }
      const rec = c.recipients?.find((r) => r.userId === userId);
      if (!rec) {
        throw new ForbiddenException('Informativo indisponível.');
      }
    }
    return c;
  }

  async markReadApp(condominiumId: string, commId: string, userId: string) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const c = await this.commRepo.findOne({
      where: { id: commId, condominiumId },
    });
    if (!c || c.status !== CommunicationStatus.Sent) {
      throw new NotFoundException('Informativo não encontrado.');
    }
    const rec = await this.recRepo.findOne({
      where: { communicationId: commId, userId },
    });
    if (!rec) {
      throw new ForbiddenException('Destinatário não encontrado.');
    }
    if (!rec.readAt) {
      rec.readAt = new Date();
      rec.readSource = CommunicationReadSource.App;
      await this.recRepo.save(rec);
    }
    return { ok: true };
  }

  async confirmReadByToken(dto: ConfirmReadDto) {
    const hash = this.hashToken(dto.token.trim());
    const rec = await this.recRepo.findOne({
      where: { emailTokenHash: hash },
      relations: { communication: true },
    });
    if (
      !rec ||
      !rec.emailTokenExpiresAt ||
      rec.emailTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new NotFoundException('Link inválido ou expirado.');
    }
    if (!rec.readAt) {
      rec.readAt = new Date();
      rec.readSource = CommunicationReadSource.EmailToken;
      await this.recRepo.save(rec);
    }
    const fe = this.frontendBase();
    const cid = rec.communication.condominiumId;
    const commId = rec.communicationId;
    return {
      redirectUrl: fe
        ? `${fe}/painel/condominio/${cid}/comunicacao/${commId}?leitura=1`
        : null,
    };
  }

  async addAttachment(
    condominiumId: string,
    commId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo ausente.');
    }
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const c = await this.requireDraft(condominiumId, commId);
    let mime = (file.mimetype ?? '').trim().toLowerCase() || 'application/octet-stream';
    if (!this.storage.isAllowedMime(mime)) {
      throw new BadRequestException('Tipo de arquivo não permitido.');
    }
    if (file.size > this.storage.maxBytesFor(mime)) {
      throw new BadRequestException('Arquivo muito grande para este tipo.');
    }
    const key = await this.storage.saveFile(condominiumId, file.buffer, mime);
    const maxRow = await this.attRepo
      .createQueryBuilder('a')
      .select('MAX(a.sortOrder)', 'm')
      .where('a.communicationId = :id', { id: c.id })
      .getRawOne<{ m: string | null }>();
    const nextOrder = Number(maxRow?.m ?? -1) + 1;
    const row = this.attRepo.create({
      id: randomUUID(),
      communicationId: c.id,
      storageKey: key,
      mimeType: mime,
      originalFilename:
        repairMojibakeUtf8Filename(
          normalizeMulterOriginalName(file.originalname || 'anexo'),
        )
          .trim()
          .slice(0, 500) || 'anexo',
      sizeBytes: file.size,
      sortOrder: nextOrder,
      uploadedByUserId: userId,
    });
    await this.attRepo.save(row);
    return this.requireCommunication(condominiumId, commId);
  }

  async removeAttachment(
    condominiumId: string,
    commId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const c = await this.requireDraft(condominiumId, commId);
    const att = await this.attRepo.findOne({
      where: { id: attachmentId, communicationId: c.id },
    });
    if (!att) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    await this.storage.deleteFile(condominiumId, att.storageKey);
    await this.attRepo.remove(att);
    return this.requireCommunication(condominiumId, commId);
  }

  async readAttachmentFile(
    condominiumId: string,
    commId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.getOne(condominiumId, commId, userId);
    const att = await this.attRepo.findOne({
      where: { id: attachmentId, communicationId: commId },
    });
    if (!att) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    const { buffer, contentType, filename } = await this.storage.readFile(
      condominiumId,
      att.storageKey,
    );
    return {
      buffer,
      contentType,
      filename: att.originalFilename || filename,
    };
  }

  async send(condominiumId: string, commId: string, userId: string) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const c = await this.requireCommunication(condominiumId, commId);
    if (c.status !== CommunicationStatus.Draft) {
      throw new BadRequestException('Este informativo já foi enviado.');
    }
    const users = await this.loadAudienceUsers(condominiumId);
    if (users.length === 0) {
      throw new BadRequestException(
        'Não há destinatários (titular, participantes ou contas ligadas às unidades) para enviar.',
      );
    }

    const tokenTtlMs = 30 * 24 * 60 * 60 * 1000;
    const apiBase = this.apiPublicBase();
    const condo = await this.condoRepo.findOne({ where: { id: condominiumId } });
    const condoName = condo?.name ?? 'Condomínio';
    const plainBody = this.stripHtml(c.body ?? '');

    type Pair = {
      rec: CommunicationRecipient;
      user: User;
      plainToken: string | null;
    };
    const pairs: Pair[] = [];

    for (const u of users) {
      const emailSnap = u.email?.trim() || null;
      const phoneSnap = u.phone?.trim() || null;
      const plainToken =
        emailSnap || phoneSnap ? randomBytes(32).toString('hex') : null;
      const hash = plainToken ? this.hashToken(plainToken) : null;
      const exp = plainToken ? new Date(Date.now() + tokenTtlMs) : null;
      const rec = this.recRepo.create({
        id: randomUUID(),
        communicationId: c.id,
        userId: u.id,
        emailSnapshot: emailSnap,
        phoneSnapshot: phoneSnap,
        emailStatus: emailSnap
          ? DeliveryChannelStatus.Pending
          : DeliveryChannelStatus.Skipped,
        smsStatus: phoneSnap
          ? DeliveryChannelStatus.Pending
          : DeliveryChannelStatus.Skipped,
        emailError: null,
        smsError: null,
        emailTokenHash: hash,
        emailTokenExpiresAt: exp,
        readAt: null,
        readSource: null,
      });
      pairs.push({ rec, user: u, plainToken });
    }
    if (
      !pairs.some(
        (p) =>
          p.rec.emailStatus === DeliveryChannelStatus.Pending ||
          p.rec.smsStatus === DeliveryChannelStatus.Pending,
      )
    ) {
      throw new BadRequestException(
        'Nenhum destinatário tem e-mail ou telefone na conta para enviar informativo.',
      );
    }
    await this.recRepo.save(pairs.map((p) => p.rec));

    for (const { rec, plainToken } of pairs) {
      if (
        rec.emailStatus === DeliveryChannelStatus.Pending &&
        rec.emailSnapshot &&
        plainToken
      ) {
        try {
          const link = apiBase
            ? `${apiBase}/public/communication-read?token=${encodeURIComponent(plainToken)}`
            : '';
          const subject = `Informativo — ${condoName}`;
          const bodyHtml = c.body?.trim()
            ? `<div>${c.body}</div>`
            : `<p>(Sem conteúdo HTML)</p>`;
          const html = `${bodyHtml}<hr><p><a href="${link}">Confirmar leitura</a></p><p><small>Se não conseguir abrir o link, copie e cole no navegador.</small></p>`;
          const text = `${plainBody || '(Sem conteúdo)'}\n\nConfirmar leitura:\n${link}\n`;
          await this.mail.sendCommunicationBroadcast({
            to: rec.emailSnapshot,
            subject,
            html,
            text,
          });
          rec.emailStatus = DeliveryChannelStatus.Sent;
        } catch (e) {
          rec.emailStatus = DeliveryChannelStatus.Failed;
          rec.emailError = e instanceof Error ? e.message : String(e);
          this.logger.warn(`E-mail informativo falhou: ${rec.emailError}`);
        }
      }

      if (
        rec.smsStatus === DeliveryChannelStatus.Pending &&
        rec.phoneSnapshot
      ) {
        const norm = normalizeBrCellphone(rec.phoneSnapshot);
        if (!norm) {
          rec.smsStatus = DeliveryChannelStatus.Failed;
          rec.smsError = 'Telefone inválido para SMS.';
        } else if (!this.comtele.isConfigured()) {
          rec.smsStatus = DeliveryChannelStatus.Failed;
          rec.smsError = 'SMS não configurado (COMTELE_AUTH_KEY).';
        } else {
          try {
            const link =
              plainToken && apiBase
                ? `${apiBase}/public/communication-read?token=${encodeURIComponent(plainToken!)}`
                : this.frontendBase()
                  ? `${this.frontendBase()}/painel/condominio/${condominiumId}/comunicacao/${c.id}`
                  : '';
            const shortTitle =
              c.title.length > 40 ? `${c.title.slice(0, 37)}...` : c.title;
            const smsBody = `${condoName}: ${shortTitle}. Leia: ${link || 'painel do condomínio.'}`.slice(
              0,
              360,
            );
            await this.comtele.send(norm, smsBody);
            rec.smsStatus = DeliveryChannelStatus.Sent;
          } catch (e) {
            rec.smsStatus = DeliveryChannelStatus.Failed;
            rec.smsError = e instanceof Error ? e.message : String(e);
            this.logger.warn(`SMS informativo falhou: ${rec.smsError}`);
          }
        }
      }
      await this.recRepo.save(rec);
    }

    c.status = CommunicationStatus.Sent;
    c.sentAt = new Date();
    await this.commRepo.save(c);
    return this.requireCommunication(condominiumId, commId);
  }
}
