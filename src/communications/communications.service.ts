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
import { Unit } from '../units/unit.entity';
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
import { Person } from '../people/person.entity';
import { User } from '../users/user.entity';
import { CommunicationAttachmentStorageHelper } from './communication-attachment-storage.helper';
import { AudiencePreviewDto } from './dto/audience-preview.dto';
import { PublicCommunicationViewDto } from './dto/public-communication-view.dto';
import { CreateCommunicationDto } from './dto/create-communication.dto';
import { UpdateCommunicationDto } from './dto/update-communication.dto';
import { CommunicationAttachment } from './entities/communication-attachment.entity';
import { CommunicationReadAccessLog } from './entities/communication-read-access-log.entity';
import { CommunicationReadLink } from './entities/communication-read-link.entity';
import { CommunicationRecipient } from './entities/communication-recipient.entity';
import { Communication } from './entities/communication.entity';
import { CommunicationReadLinkChannel } from './enums/communication-read-link-channel.enum';
import { CommunicationStatus } from './enums/communication-status.enum';
import { DeliveryChannelStatus } from './enums/delivery-channel-status.enum';
import { CommunicationReadSource } from './enums/read-source.enum';

export type AudiencePreviewUser = {
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  unitSummary: string[];
};

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
    @InjectRepository(CommunicationReadLink)
    private readonly readLinkRepo: Repository<CommunicationReadLink>,
    @InjectRepository(CommunicationReadAccessLog)
    private readonly readAccessLogRepo: Repository<CommunicationReadAccessLog>,
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
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

  /** Página pública do `condo-web` que mostra o comunicado e regista a leitura. */
  buildPublicReadPageUrl(plainToken: string): string | null {
    const fe = this.frontendBase();
    if (!fe) {
      return null;
    }
    return `${fe}/comunicado/publico?token=${encodeURIComponent(plainToken)}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  /**
   * Remove BOM, aspas/chevrons de mail clients e aplica decodeURIComponent seguro
   * quando o token veio duplamente codificado na query string.
   */
  private normalizeReadAccessToken(raw: string): string {
    let t = raw.trim();
    if (t.charCodeAt(0) === 0xfeff) {
      t = t.slice(1).trim();
    }
    for (let i = 0; i < 3; i += 1) {
      if (!/%[0-9A-Fa-f]{2}/.test(t)) {
        break;
      }
      try {
        const next = decodeURIComponent(t);
        if (next === t) {
          break;
        }
        t = next;
      } catch {
        break;
      }
    }
    return t.replace(/^[<'"(]+/, '').replace(/[>),.'"]+$/, '').trim();
  }

  /**
   * O token opaco atual é 32 caracteres hex (minúsculos no servidor). Alguns clientes
   * alteram maiúsculas/minúsculas ou inserem espaços de quebra de linha no URL.
   */
  private canonicalReadTokenForHash(raw: string): string {
    const n = this.normalizeReadAccessToken(raw).replace(/\s/g, '');
    if (/^[0-9a-fA-F]{32}$/.test(n)) {
      return n.toLowerCase();
    }
    return n;
  }

  /** Mesma normalização usada na vista pública e no redirect `/public/communication-read`. */
  normalizePublicReadToken(raw: string): string {
    return this.canonicalReadTokenForHash(raw);
  }

  /** Token opaco curto para URL (hash no servidor continua SHA-256). */
  private newReadPlainToken(): string {
    return randomBytes(16).toString('hex');
  }

  private readSourceForChannel(
    ch: CommunicationReadLinkChannel,
  ): CommunicationReadSource {
    switch (ch) {
      case CommunicationReadLinkChannel.Email:
        return CommunicationReadSource.EmailLink;
      case CommunicationReadLinkChannel.Sms:
        return CommunicationReadSource.SmsLink;
      case CommunicationReadLinkChannel.Whatsapp:
        return CommunicationReadSource.WhatsappLink;
      default:
        return CommunicationReadSource.EmailLink;
    }
  }

  /** Nome na ficha (people.full_name) ou e-mail da conta, para distinguir utilizadores. */
  private async buildUserDisplayNameMap(userIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.map((id) => id?.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return new Map();
    }
    const [persons, users] = await Promise.all([
      this.personRepo.find({ where: { userId: In(ids) } }),
      this.userRepo.findBy({ id: In(ids) }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const personByUserId = new Map<string, Person>();
    for (const p of persons) {
      const uid = p.userId?.trim();
      if (uid && !personByUserId.has(uid)) {
        personByUserId.set(uid, p);
      }
    }
    const out = new Map<string, string>();
    for (const id of ids) {
      const person = personByUserId.get(id);
      const user = userById.get(id);
      const label = (person?.fullName?.trim() || user?.email || id).slice(0, 255);
      out.set(id, label);
    }
    return out;
  }

  private async loadReadConfirmationsForResponse(
    communicationId: string,
    viewerUserId: string,
    isMgmt: boolean,
  ): Promise<
    {
      userId: string;
      readerName: string;
      unitId: string;
      unitLabel: string;
      channel: string;
      kind: string;
      readAt: string;
    }[]
  > {
    const qb = this.readAccessLogRepo
      .createQueryBuilder('a')
      .where('a.communication_id = :id', { id: communicationId })
      .orderBy('a.accessed_at', 'ASC');
    if (!isMgmt) {
      qb.andWhere('a.user_id = :uid', { uid: viewerUserId });
    }
    const rows = await qb.getMany();
    const unitIds = [
      ...new Set(
        rows.map((r) => r.unitId).filter((id): id is string => !!id?.trim()),
      ),
    ];
    const units =
      unitIds.length === 0
        ? []
        : await this.unitRepo.find({
            where: { id: In(unitIds) },
            relations: { grouping: true },
          });
    const labelById = new Map(
      units.map((u) => {
        const g = u.grouping?.name?.trim() || '—';
        const ident = u.identifier?.trim() || '—';
        return [u.id, `${ident} (${g})`] as const;
      }),
    );
    const missingReaderNames = rows.filter((r) => !r.readerDisplayName?.trim()).map((r) => r.userId);
    const readerFallback =
      missingReaderNames.length > 0
        ? await this.buildUserDisplayNameMap(missingReaderNames)
        : new Map<string, string>();
    return rows.map((row) => ({
      userId: row.userId,
      readerName: (
        row.readerDisplayName?.trim() ||
        readerFallback.get(row.userId) ||
        row.userId
      ).slice(0, 255),
      unitId: row.unitId ?? '',
      unitLabel: row.unitId
        ? (labelById.get(row.unitId) ?? row.unitId)
        : '—',
      channel: row.channel,
      kind: row.kind,
      readAt: row.accessedAt.toISOString(),
    }));
  }

  private async appendReadAccessLog(dto: {
    communicationId: string;
    userId: string;
    unitId: string | null;
    channel: string;
    kind: 'public_view' | 'attachment_download' | 'app_panel';
    readLinkId?: string | null;
    readerDisplayName?: string | null;
  }): Promise<void> {
    let readerDisplayName = dto.readerDisplayName?.trim() || null;
    if (!readerDisplayName) {
      const m = await this.buildUserDisplayNameMap([dto.userId]);
      readerDisplayName = m.get(dto.userId) ?? null;
    }
    const row = this.readAccessLogRepo.create({
      id: randomUUID(),
      communicationId: dto.communicationId,
      userId: dto.userId,
      readerDisplayName,
      unitId: dto.unitId,
      channel: dto.channel,
      kind: dto.kind,
      readLinkId: dto.readLinkId ?? null,
      accessedAt: new Date(),
    });
    await this.readAccessLogRepo.save(row);
  }

  private async touchRecipientLastRead(
    communicationId: string,
    userId: string,
    source: CommunicationReadSource,
  ): Promise<void> {
    const rec = await this.recRepo.findOne({
      where: { communicationId, userId },
    });
    if (rec) {
      rec.readAt = new Date();
      rec.readSource = source;
      await this.recRepo.save(rec);
    }
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

  private parseUuidArrayJson(raw: string | null | undefined): string[] | null {
    if (raw == null || !String(raw).trim()) {
      return null;
    }
    try {
      const v = JSON.parse(String(raw)) as unknown;
      if (!Array.isArray(v)) {
        return null;
      }
      return v.map(String).filter(Boolean);
    } catch {
      return null;
    }
  }

  private parseRecipientPrefs(
    raw: string | null | undefined,
  ): { userId: string; email?: boolean; sms?: boolean; whatsapp?: boolean }[] {
    if (raw == null || !String(raw).trim()) {
      return [];
    }
    try {
      const v = JSON.parse(String(raw)) as unknown;
      return Array.isArray(v)
        ? (v as {
            userId: string;
            email?: boolean;
            sms?: boolean;
            whatsapp?: boolean;
          }[])
        : [];
    } catch {
      return [];
    }
  }

  private effectiveChannelsForUser(
    c: Communication,
    userId: string,
  ): { email: boolean; sms: boolean; whatsapp: boolean } {
    const global = {
      email: c.channelEmailEnabled !== false,
      sms: c.channelSmsEnabled !== false,
      whatsapp: c.channelWhatsappEnabled === true,
    };
    const row = this.parseRecipientPrefs(c.recipientDeliveryPrefs).find(
      (p) => p.userId === userId,
    );
    if (!row) {
      return global;
    }
    return {
      email: row.email !== undefined ? row.email : global.email,
      sms: row.sms !== undefined ? row.sms : global.sms,
      whatsapp: row.whatsapp !== undefined ? row.whatsapp : global.whatsapp,
    };
  }

  private async resolveAudienceUserIdsFromCommunication(
    condominiumId: string,
    c: Communication,
  ): Promise<string[]> {
    const scope: 'units' | 'groupings' =
      c.audienceScope === 'groupings' ? 'groupings' : 'units';
    const ids =
      scope === 'units'
        ? (this.parseUuidArrayJson(c.audienceUnitIds) ?? [])
        : (this.parseUuidArrayJson(c.audienceGroupingIds) ?? []);
    return this.governance.listUnitLinkedAccountUserIds(
      condominiumId,
      scope,
      ids,
    );
  }

  async previewAudience(
    condominiumId: string,
    userId: string,
    dto: AudiencePreviewDto,
  ) {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);
    const scope = dto.scope;
    const selectedIds =
      scope === 'units'
        ? [...new Set((dto.unitIds ?? []).map((x) => x.trim()).filter(Boolean))]
        : [
            ...new Set(
              (dto.groupingIds ?? []).map((x) => x.trim()).filter(Boolean),
            ),
          ];
    const units = await this.governance.loadUnitsForCommunicationAudience(
      condominiumId,
      scope,
      selectedIds,
    );
    type Agg = {
      userId: string;
      displayName: string;
      links: Set<string>;
    };
    const map = new Map<string, Agg>();
    for (const unit of units) {
      const gname = unit.grouping?.name?.trim() || '—';
      const ident = unit.identifier?.trim() || '—';
      const tag = `${ident} (${gname})`;
      const ou = unit.ownerPerson?.userId?.trim();
      if (ou) {
        const fn = unit.ownerPerson?.fullName?.trim() || '—';
        if (!map.has(ou)) {
          map.set(ou, { userId: ou, displayName: fn, links: new Set() });
        }
        map.get(ou)!.links.add(`${tag} · proprietário`);
      }
      for (const link of unit.responsibleLinks ?? []) {
        const pid = link.person?.userId?.trim();
        if (!pid) {
          continue;
        }
        const fn = link.person?.fullName?.trim() || '—';
        if (!map.has(pid)) {
          map.set(pid, { userId: pid, displayName: fn, links: new Set() });
        }
        map.get(pid)!.links.add(`${tag} · responsável`);
      }
    }
    const userIds = [...map.keys()];
    if (userIds.length === 0) {
      return { users: [] as AudiencePreviewUser[] };
    }
    const users = await this.userRepo.findBy({ id: In(userIds) });
    const userById = new Map(users.map((u) => [u.id, u]));
    const out: AudiencePreviewUser[] = userIds.map((id) => {
      const agg = map.get(id)!;
      const u = userById.get(id);
      const email = u?.email?.trim() || null;
      const phone = u?.phone?.trim() || null;
      return {
        userId: id,
        displayName: (agg.displayName || u?.email || id).slice(0, 200),
        email,
        phone,
        hasEmail: !!email,
        hasPhone: !!phone,
        unitSummary: [...agg.links].sort((a, b) => a.localeCompare(b, 'pt')),
      };
    });
    out.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'pt', { sensitivity: 'base' }),
    );
    return { users: out };
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
      audienceScope: 'units',
      audienceUnitIds: null,
      audienceGroupingIds: null,
      channelEmailEnabled: true,
      channelSmsEnabled: true,
      channelWhatsappEnabled: false,
      recipientDeliveryPrefs: null,
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
    const c = await this.commRepo.findOne({
      where: { id, condominiumId },
      relations: { attachments: true },
    });
    if (!c) {
      throw new NotFoundException('Informativo não encontrado.');
    }
    const isSent = c.status === CommunicationStatus.Sent;
    if (!isSent && c.status !== CommunicationStatus.Draft) {
      throw new BadRequestException('Estado do informativo inválido.');
    }
    if (isSent) {
      if (dto.title !== undefined || dto.body !== undefined) {
        throw new BadRequestException(
          'Não é possível alterar título ou texto de um informativo já enviado.',
        );
      }
    }
    if (!isSent && dto.title !== undefined) {
      c.title = dto.title.trim();
    }
    if (!isSent && dto.body !== undefined) {
      c.body = sanitizePollBodyRich(dto.body) ?? null;
    }
    if (dto.audienceScope !== undefined) {
      c.audienceScope = dto.audienceScope;
      if (dto.audienceScope === 'units') {
        c.audienceGroupingIds = null;
      } else {
        c.audienceUnitIds = null;
      }
    }
    if (dto.audienceUnitIds !== undefined) {
      c.audienceUnitIds =
        dto.audienceUnitIds.length > 0
          ? JSON.stringify([...new Set(dto.audienceUnitIds)])
          : null;
    }
    if (dto.audienceGroupingIds !== undefined) {
      c.audienceGroupingIds =
        dto.audienceGroupingIds.length > 0
          ? JSON.stringify([...new Set(dto.audienceGroupingIds)])
          : null;
    }
    if (dto.channelEmailEnabled !== undefined) {
      c.channelEmailEnabled = dto.channelEmailEnabled;
    }
    if (dto.channelSmsEnabled !== undefined) {
      c.channelSmsEnabled = dto.channelSmsEnabled;
    }
    if (dto.channelWhatsappEnabled !== undefined) {
      c.channelWhatsappEnabled = dto.channelWhatsappEnabled;
    }
    if (dto.recipientDeliveryPrefs !== undefined) {
      c.recipientDeliveryPrefs =
        dto.recipientDeliveryPrefs.length > 0
          ? JSON.stringify(dto.recipientDeliveryPrefs)
          : null;
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
    const readConfirmations = await this.loadReadConfirmationsForResponse(
      commId,
      userId,
      isMgmt,
    );
    return Object.assign(c, { readConfirmations });
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
    await this.appendReadAccessLog({
      communicationId: commId,
      userId,
      unitId: null,
      channel: 'app',
      kind: 'app_panel',
    });
    await this.touchRecipientLastRead(
      commId,
      userId,
      CommunicationReadSource.App,
    );
    return { ok: true };
  }

  private async loadCommunicationForPublicView(
    communicationId: string,
  ): Promise<Communication | null> {
    return this.commRepo.findOne({
      where: { id: communicationId },
      relations: { attachments: true },
    });
  }

  async viewByReadToken(rawToken: string): Promise<PublicCommunicationViewDto> {
    const raw = this.canonicalReadTokenForHash(rawToken);
    if (raw.length < 16) {
      throw new BadRequestException('Token inválido.');
    }
    const hash = this.hashToken(raw);
    const link = await this.readLinkRepo.findOne({
      where: { tokenHash: hash },
    });
    if (link) {
      const c = await this.loadCommunicationForPublicView(link.communicationId);
      if (!c || c.status !== CommunicationStatus.Sent) {
        throw new NotFoundException('Comunicado não encontrado.');
      }
      await this.appendReadAccessLog({
        communicationId: link.communicationId,
        userId: link.userId,
        unitId: link.unitId,
        channel: link.channel,
        kind: 'public_view',
        readLinkId: link.id,
      });
      await this.touchRecipientLastRead(
        link.communicationId,
        link.userId,
        this.readSourceForChannel(link.channel),
      );
      return this.buildPublicViewDto(c, raw);
    }

    const rec = await this.recRepo.findOne({
      where: { emailTokenHash: hash },
    });
    if (!rec) {
      throw new NotFoundException('Link inválido.');
    }
    const c = await this.loadCommunicationForPublicView(rec.communicationId);
    if (!c || c.status !== CommunicationStatus.Sent) {
      throw new NotFoundException('Comunicado não encontrado.');
    }
    await this.appendReadAccessLog({
      communicationId: rec.communicationId,
      userId: rec.userId,
      unitId: null,
      channel: 'legacy_email',
      kind: 'public_view',
    });
    await this.touchRecipientLastRead(
      rec.communicationId,
      rec.userId,
      CommunicationReadSource.EmailLink,
    );
    return this.buildPublicViewDto(c, raw);
  }

  private async buildPublicViewDto(
    c: Communication,
    rawToken: string,
  ): Promise<PublicCommunicationViewDto> {
    const condo = await this.condoRepo.findOne({
      where: { id: c.condominiumId },
    });
    const apiBase = this.apiPublicBase();
    const attachments = (c.attachments ?? []).map((a) => ({
      id: a.id,
      originalFilename: a.originalFilename,
      sizeBytes: a.sizeBytes,
      fileUrl: apiBase
        ? `${apiBase}/public/communications/attachments/${a.id}/file?token=${encodeURIComponent(rawToken)}`
        : null,
    }));
    return {
      condominiumName: condo?.name ?? 'Condomínio',
      title: c.title,
      bodyHtml: c.body,
      sentAt: c.sentAt ? c.sentAt.toISOString() : null,
      attachments,
    };
  }

  async readAttachmentFileByReadToken(
    rawToken: string,
    attachmentId: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const raw = this.canonicalReadTokenForHash(rawToken);
    if (raw.length < 16) {
      throw new BadRequestException('Token inválido.');
    }
    const hash = this.hashToken(raw);
    const link = await this.readLinkRepo.findOne({ where: { tokenHash: hash } });
    const legacyRec = link
      ? null
      : await this.recRepo.findOne({ where: { emailTokenHash: hash } });
    if (!link && !legacyRec) {
      throw new NotFoundException('Link inválido.');
    }
    const communicationId = link
      ? link.communicationId
      : legacyRec!.communicationId;
    const att = await this.attRepo.findOne({
      where: { id: attachmentId, communicationId },
    });
    if (!att) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    const comm = await this.commRepo.findOne({
      where: { id: communicationId },
    });
    if (!comm || comm.status !== CommunicationStatus.Sent) {
      throw new NotFoundException('Comunicado não encontrado.');
    }
    const { buffer, contentType, filename } = await this.storage.readFile(
      comm.condominiumId,
      att.storageKey,
    );
    if (link) {
      await this.appendReadAccessLog({
        communicationId: link.communicationId,
        userId: link.userId,
        unitId: link.unitId,
        channel: link.channel,
        kind: 'attachment_download',
        readLinkId: link.id,
      });
      await this.touchRecipientLastRead(
        link.communicationId,
        link.userId,
        this.readSourceForChannel(link.channel),
      );
    } else {
      await this.appendReadAccessLog({
        communicationId: legacyRec!.communicationId,
        userId: legacyRec!.userId,
        unitId: null,
        channel: 'legacy_email',
        kind: 'attachment_download',
      });
      await this.touchRecipientLastRead(
        legacyRec!.communicationId,
        legacyRec!.userId,
        CommunicationReadSource.EmailLink,
      );
    }
    return {
      buffer,
      contentType,
      filename: att.originalFilename || filename,
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
    const isResend = c.status === CommunicationStatus.Sent;
    if (c.status !== CommunicationStatus.Draft && !isResend) {
      throw new BadRequestException(
        'Só é possível enviar informativos em rascunho ou reenviar os já enviados.',
      );
    }
    const fe = this.frontendBase();
    if (!fe) {
      throw new BadRequestException(
        'Configure FRONTEND_PUBLIC_URL com a URL pública do site (ex.: https://app.exemplo.com) para os links do comunicado.',
      );
    }
    const attachmentsCount = (c.attachments ?? []).length;
    const apiBase = this.apiPublicBase();
    if (attachmentsCount > 0 && !apiBase) {
      throw new BadRequestException(
        'Este informativo tem anexos: configure API_PUBLIC_BASE_URL (ou BACKEND_PUBLIC_URL) para o download na página pública.',
      );
    }

    const userIdList = [
      ...new Set(
        await this.resolveAudienceUserIdsFromCommunication(condominiumId, c),
      ),
    ];
    /**
     * Rascunho (ou reenvio após falha parcial): apagar destinatários e links antigos.
     * Reenvio de já enviado: só apagar destinatários — mantém `read_links` para os links dos e-mails anteriores continuarem válidos.
     */
    if (!isResend) {
      await this.readLinkRepo.delete({ communicationId: c.id });
    }
    await this.recRepo.delete({ communicationId: c.id });
    /** Evitar que `save(c)` no fim tente sincronizar estes destinatários já apagados (UPDATE communication_id = NULL). */
    c.recipients = [];
    const users =
      userIdList.length === 0
        ? []
        : await this.userRepo.findBy({ id: In(userIdList) });
    if (users.length === 0) {
      throw new BadRequestException(
        'Não há destinatários com conta ligada às unidades selecionadas (proprietário ou responsável identificado).',
      );
    }
    const recipientNameByUserId = await this.buildUserDisplayNameMap(
      users.map((u) => u.id),
    );

    const scope: 'units' | 'groupings' =
      c.audienceScope === 'groupings' ? 'groupings' : 'units';
    const audienceIds =
      scope === 'units'
        ? (this.parseUuidArrayJson(c.audienceUnitIds) ?? [])
        : (this.parseUuidArrayJson(c.audienceGroupingIds) ?? []);

    const audienceUnitsByUser = new Map<string, Unit[]>();
    for (const u of users) {
      const units = await this.governance.listAudienceUnitsForAccountUser(
        condominiumId,
        scope,
        audienceIds,
        u.id,
      );
      audienceUnitsByUser.set(u.id, units);
    }

    const condo = await this.condoRepo.findOne({ where: { id: condominiumId } });
    const condoName = condo?.name ?? 'Condomínio';

    type SendRow = {
      rec: CommunicationRecipient;
      user: User;
      audienceUnits: Unit[];
      emailPlainByUnitId: Map<string, string>;
      smsPlainByUnitId: Map<string, string>;
    };
    const rows: SendRow[] = [];
    const readLinks: CommunicationReadLink[] = [];

    for (const u of users) {
      const audienceUnits = audienceUnitsByUser.get(u.id) ?? [];
      if (audienceUnits.length === 0) {
        this.logger.warn(
          `Communication send: utilizador ${u.id} sem unidade na audiência; ignorado.`,
        );
        continue;
      }
      const ch = this.effectiveChannelsForUser(c, u.id);
      const emailSnap = u.email?.trim() || null;
      const phoneSnap = u.phone?.trim() || null;
      const rec = this.recRepo.create({
        id: randomUUID(),
        communicationId: c.id,
        userId: u.id,
        recipientDisplayName:
          recipientNameByUserId.get(u.id) ?? emailSnap ?? phoneSnap ?? null,
        emailSnapshot: emailSnap,
        phoneSnapshot: phoneSnap,
        emailStatus:
          ch.email && emailSnap
            ? DeliveryChannelStatus.Pending
            : DeliveryChannelStatus.Skipped,
        smsStatus:
          ch.sms && phoneSnap
            ? DeliveryChannelStatus.Pending
            : DeliveryChannelStatus.Skipped,
        emailError: null,
        smsError: null,
        whatsappStatus:
          ch.whatsapp && phoneSnap
            ? DeliveryChannelStatus.Pending
            : DeliveryChannelStatus.Skipped,
        whatsappError: null,
        emailTokenHash: null,
        emailTokenExpiresAt: null,
        readAt: null,
        readSource: null,
      });
      const emailPlainByUnitId = new Map<string, string>();
      const smsPlainByUnitId = new Map<string, string>();

      for (const unit of audienceUnits) {
        if (
          ch.email &&
          emailSnap &&
          rec.emailStatus === DeliveryChannelStatus.Pending
        ) {
          const plain = this.newReadPlainToken();
          emailPlainByUnitId.set(unit.id, plain);
          readLinks.push(
            this.readLinkRepo.create({
              id: randomUUID(),
              communicationId: c.id,
              userId: u.id,
              unitId: unit.id,
              channel: CommunicationReadLinkChannel.Email,
              tokenHash: this.hashToken(plain),
              expiresAt: null,
              consumedAt: null,
            }),
          );
        }
        if (
          ch.sms &&
          phoneSnap &&
          rec.smsStatus === DeliveryChannelStatus.Pending
        ) {
          const plain = this.newReadPlainToken();
          smsPlainByUnitId.set(unit.id, plain);
          readLinks.push(
            this.readLinkRepo.create({
              id: randomUUID(),
              communicationId: c.id,
              userId: u.id,
              unitId: unit.id,
              channel: CommunicationReadLinkChannel.Sms,
              tokenHash: this.hashToken(plain),
              expiresAt: null,
              consumedAt: null,
            }),
          );
        }
      }

      /**
       * Espelha o token do primeiro link de e-mail (mesmo hash em `communication_read_links`).
       * A abertura pública usa sobretudo `read_links`; este campo mantém compatibilidade e
       * inspeção na tabela de destinatários.
       */
      if (emailPlainByUnitId.size > 0) {
        const primaryUnit = audienceUnits.find((unit) =>
          emailPlainByUnitId.has(unit.id),
        );
        const primaryPlain =
          primaryUnit != null
            ? emailPlainByUnitId.get(primaryUnit.id)!
            : [...emailPlainByUnitId.values()][0]!;
        rec.emailTokenHash = this.hashToken(primaryPlain);
        rec.emailTokenExpiresAt = null;
      }

      rows.push({
        rec,
        user: u,
        audienceUnits,
        emailPlainByUnitId,
        smsPlainByUnitId,
      });
    }

    if (
      !rows.some(
        (r) =>
          r.rec.emailStatus === DeliveryChannelStatus.Pending ||
          r.rec.smsStatus === DeliveryChannelStatus.Pending,
      )
    ) {
      throw new BadRequestException(
        'Nenhum envio efetivo: ative e-mail ou SMS para quem tenha contato na conta, ou atualize a pré-visualização e salve o rascunho.',
      );
    }

    if (readLinks.length === 0) {
      throw new BadRequestException(
        'Não foi possível gerar links de leitura por unidade; verifique a audiência.',
      );
    }

    await this.recRepo.save(rows.map((r) => r.rec));
    await this.readLinkRepo.save(readLinks);

    const pageUrl = (plain: string) => this.buildPublicReadPageUrl(plain) ?? '';

    for (const { rec, audienceUnits, emailPlainByUnitId, smsPlainByUnitId } of rows) {
      if (
        rec.emailStatus === DeliveryChannelStatus.Pending &&
        rec.emailSnapshot &&
        emailPlainByUnitId.size > 0
      ) {
        try {
          const items = audienceUnits
            .filter((unit) => emailPlainByUnitId.has(unit.id))
            .map((unit) => {
              const plain = emailPlainByUnitId.get(unit.id)!;
              const gname = unit.grouping?.name?.trim() || '—';
              const ident = unit.identifier?.trim() || '—';
              return { label: `${ident} (${gname})`, url: pageUrl(plain) };
            });
          const subject = isResend
            ? `Novo envio — comunicado no ${condoName}`
            : `Novo comunicado no ${condoName}`;
          const primary = items[0]!;
          const extra = items.slice(1);
          const readBlock =
            extra.length === 0
              ? `<p><a href="${primary.url}"><strong>CLIQUE AQUI PARA LER O COMUNICADO</strong></a></p>`
              : `<p><a href="${primary.url}"><strong>CLIQUE AQUI PARA LER O COMUNICADO</strong></a> <span>(${primary.label})</span></p><p><small>Outras unidades em que você está vinculado(a):</small></p><ul>${extra
                  .map(
                    (it) =>
                      `<li><a href="${it.url}"><strong>CLIQUE AQUI PARA LER O COMUNICADO</strong></a> (${it.label})</li>`,
                  )
                  .join('')}</ul>`;
          const html = isResend
            ? `<p>Olá,</p><p>Segue um novo envio com o link para consultar o informativo no seu condomínio:</p>${readBlock}<p><small>Se o link não abrir, copie e cole o endereço no navegador.</small></p>`
            : `<p>Olá,</p><p>Um novo comunicado foi enviado no seu condomínio. Você pode verificá-lo na íntegra clicando no link abaixo:</p>${readBlock}<p><small>Se o link não abrir, copie e cole o endereço no navegador.</small></p>`;
          const textPrimary = `CLIQUE AQUI PARA LER O COMUNICADO:\n${primary.url}`;
          const textExtra =
            extra.length === 0
              ? ''
              : `\n\nOutras unidades:\n${extra.map((it) => `${it.label}\n${it.url}`).join('\n\n')}`;
          const text = isResend
            ? `Olá,\n\nNovo envio do informativo do condomínio. Use o(s) link(s) abaixo.\n\n${textPrimary}${textExtra}\n`
            : `Olá,\n\nUm novo comunicado foi enviado no seu condomínio. Você pode verificá-lo na íntegra usando o(s) link(s) abaixo.\n\n${textPrimary}${textExtra}\n`;
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
        } else if (smsPlainByUnitId.size === 0) {
          rec.smsStatus = DeliveryChannelStatus.Failed;
          rec.smsError = 'Sem links de leitura por unidade para SMS.';
        } else {
          try {
            for (const unit of audienceUnits) {
              const plain = smsPlainByUnitId.get(unit.id);
              if (!plain) {
                continue;
              }
              const url = pageUrl(plain);
              const smsBody = (
                isResend
                  ? `Novo envio — comunicado no ${condoName}, acesse: ${url}`
                  : `Novo comunicado no ${condoName}, acesse: ${url}`
              ).slice(0, 360);
              await this.comtele.send(norm, smsBody);
            }
            rec.smsStatus = DeliveryChannelStatus.Sent;
          } catch (e) {
            rec.smsStatus = DeliveryChannelStatus.Failed;
            rec.smsError = e instanceof Error ? e.message : String(e);
            this.logger.warn(`SMS informativo falhou: ${rec.smsError}`);
          }
        }
      }

      if (rec.whatsappStatus === DeliveryChannelStatus.Pending) {
        rec.whatsappStatus = DeliveryChannelStatus.Skipped;
        rec.whatsappError =
          'Canal WhatsApp ainda não integrado. Modelo previsto: Olá, um novo comunicado foi enviado no seu condomínio; leia na íntegra em [link da página pública].';
      }

      await this.recRepo.save(rec);
    }

    const now = new Date();
    const broadcasterNames = await this.buildUserDisplayNameMap([userId]);
    const broadcasterName = broadcasterNames.get(userId) ?? null;
    if (isResend) {
      await this.commRepo.update(
        { id: c.id, condominiumId },
        {
          updatedAt: now,
          lastBroadcastUserId: userId,
          lastBroadcastUserName: broadcasterName,
        },
      );
    } else {
      await this.commRepo.update(
        { id: c.id, condominiumId },
        {
          status: CommunicationStatus.Sent,
          sentAt: now,
          updatedAt: now,
          lastBroadcastUserId: userId,
          lastBroadcastUserName: broadcasterName,
        },
      );
    }
    return this.requireCommunication(condominiumId, commId);
  }
}
