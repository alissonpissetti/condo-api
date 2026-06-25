import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { saoPauloPartsFromInstant } from '../common/america-sao-paulo-time.util';
import { sanitizeDownloadFilename } from '../common/http-content-disposition.util';
import {
  formatDateOnlyYmdUtc,
  todayLocalCalendarAsUtcNoon,
} from '../finance/date-only.util';
import { FinancialTransaction } from '../finance/entities/financial-transaction.entity';
import { Person } from '../people/person.entity';
import { GovernanceService } from '../planning/governance.service';
import {
  encodeUploadOriginalFilename,
  repairMojibakeUtf8Filename,
} from '../planning/upload-filename-encoding.util';
import { usesLocalDiskOnly } from '../storage/storage-driver.util';
import { WORK_DOCUMENT_STORAGE } from '../storage/storage.tokens';
import type { WorkDocumentStoragePort } from '../storage/work-document-storage.port';
import { User } from '../users/user.entity';
import { CondominiumSuppliersService } from '../condominium-works/condominium-suppliers.service';
import {
  assertNoteHasContent,
  parseCreateTimelineNoteBody,
} from '../condominium-works/dto/parse-create-timeline-note-body';
import { resolveTimelineRecordedAt } from '../condominium-works/dto/parse-timeline-recorded-on';
import { resolveRecordedOnWithFilenameFallback } from '../condominium-works/utils/filename-recorded-on.util';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceTimelineEntryDto } from './dto/update-maintenance-timeline-entry.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { CondominiumMaintenanceTimelineAttachment } from './entities/condominium-maintenance-timeline-attachment.entity';
import { CondominiumMaintenanceTimelineEntry } from './entities/condominium-maintenance-timeline-entry.entity';
import { CondominiumMaintenance } from './entities/condominium-maintenance.entity';
import { MaintenanceTimelineKind } from './enums/maintenance-timeline-kind.enum';
import { MaintenanceStatus } from './enums/maintenance-status.enum';

export type MaintenanceTimelineAttachmentDto = {
  id: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** URL no storage (ex. storage.meucondominio.cloud); null = usar download via API. */
  fileUrl: string | null;
};

export type MaintenanceTimelineTransactionDto = {
  id: string;
  kind: string;
  title: string;
  amountCents: string;
  occurredOn: string;
  paymentStatus: string;
};

export type MaintenanceTimelineEntryDto = {
  id: string;
  kind: MaintenanceTimelineKind;
  body: string | null;
  attachments: MaintenanceTimelineAttachmentDto[];
  authorUserId: string;
  authorDisplayName: string;
  createdAt: string;
  financialTransactionId: string | null;
  transaction: MaintenanceTimelineTransactionDto | null;
};

export type MaintenanceListItemDto = {
  id: string;
  condominiumId: string;
  title: string;
  description: string | null;
  location: string | null;
  replacedParts: string | null;
  supplierId: string | null;
  supplierName: string | null;
  status: MaintenanceStatus;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
};

export type MaintenanceCostsSummaryDto = {
  totalCents: string;
  forecastCents: string;
  expenseCount: number;
  paidCents: string;
  paidCount: number;
  overdueCents: string;
  overdueCount: number;
  futureCents: string;
  futureCount: number;
};

export type MaintenanceDetailDto = MaintenanceListItemDto & {
  timeline: MaintenanceTimelineEntryDto[];
  costsSummary: MaintenanceCostsSummaryDto;
};

const MAINTENANCE_STATUS_LABELS_PT: Record<MaintenanceStatus, string> = {
  [MaintenanceStatus.Open]: 'Aberta',
  [MaintenanceStatus.InProgress]: 'Em andamento',
  [MaintenanceStatus.Completed]: 'Concluída',
  [MaintenanceStatus.Cancelled]: 'Cancelada',
};

function isActiveMaintenanceStatus(status: MaintenanceStatus): boolean {
  return (
    status === MaintenanceStatus.Open ||
    status === MaintenanceStatus.InProgress
  );
}

function maintenanceStatusSectionRank(status: MaintenanceStatus): number {
  if (isActiveMaintenanceStatus(status)) {
    return 0;
  }
  if (status === MaintenanceStatus.Completed) {
    return 1;
  }
  return 2;
}

function compareMaintenancesForList(
  a: MaintenanceListItemDto,
  b: MaintenanceListItemDto,
): number {
  const ra = maintenanceStatusSectionRank(a.status);
  const rb = maintenanceStatusSectionRank(b.status);
  if (ra !== rb) {
    return ra - rb;
  }
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function formatTimelineInstantPt(d: Date): string {
  const p = saoPauloPartsFromInstant(d);
  const dd = String(p.day).padStart(2, '0');
  const mm = String(p.month).padStart(2, '0');
  const hh = String(p.hour).padStart(2, '0');
  const mi = String(p.minute).padStart(2, '0');
  return `${dd}/${mm}/${p.year} ${hh}:${mi}`;
}

function buildMaintenanceCreateAuditBody(status: MaintenanceStatus): string {
  return `Manutenção criada com status «${MAINTENANCE_STATUS_LABELS_PT[status]}».`;
}

function buildMaintenanceUpdateAuditBody(input: {
  previousTitle: string;
  previousDescription: string | null;
  previousLocation: string | null;
  previousReplacedParts: string | null;
  previousSupplierName: string | null;
  previousStatus: MaintenanceStatus;
  nextTitle?: string;
  nextDescription?: string | null;
  nextLocation?: string | null;
  nextReplacedParts?: string | null;
  nextSupplierName?: string | null;
  nextStatus?: MaintenanceStatus;
}): string | null {
  const lines: string[] = [];
  if (
    input.nextTitle !== undefined &&
    input.nextTitle.trim() !== input.previousTitle.trim()
  ) {
    lines.push(
      `Título alterado de «${input.previousTitle.trim()}» para «${input.nextTitle.trim()}».`,
    );
  }
  if (input.nextDescription !== undefined) {
    const oldDesc = (input.previousDescription ?? '').trim();
    const newDesc = (input.nextDescription ?? '').trim();
    if (oldDesc !== newDesc) {
      if (!oldDesc && newDesc) {
        lines.push('Descrição adicionada.');
      } else if (oldDesc && !newDesc) {
        lines.push('Descrição removida.');
      } else {
        lines.push('Descrição atualizada.');
      }
    }
  }
  if (input.nextLocation !== undefined) {
    const oldLoc = (input.previousLocation ?? '').trim();
    const newLoc = (input.nextLocation ?? '').trim();
    if (oldLoc !== newLoc) {
      if (!oldLoc && newLoc) {
        lines.push(`Local definido como «${newLoc}».`);
      } else if (oldLoc && !newLoc) {
        lines.push('Local removido.');
      } else {
        lines.push(`Local alterado de «${oldLoc}» para «${newLoc}».`);
      }
    }
  }
  if (input.nextReplacedParts !== undefined) {
    const oldParts = (input.previousReplacedParts ?? '').trim();
    const newParts = (input.nextReplacedParts ?? '').trim();
    if (oldParts !== newParts) {
      if (!oldParts && newParts) {
        lines.push('Peças trocadas registradas.');
      } else if (oldParts && !newParts) {
        lines.push('Registro de peças trocadas removido.');
      } else {
        lines.push('Peças trocadas atualizadas.');
      }
    }
  }
  if (input.nextSupplierName !== undefined) {
    const oldSupplier = (input.previousSupplierName ?? '').trim();
    const newSupplier = (input.nextSupplierName ?? '').trim();
    if (oldSupplier !== newSupplier) {
      if (!oldSupplier && newSupplier) {
        lines.push(`Fornecedor definido como «${newSupplier}».`);
      } else if (oldSupplier && !newSupplier) {
        lines.push('Fornecedor removido.');
      } else {
        lines.push(
          `Fornecedor alterado de «${oldSupplier}» para «${newSupplier}».`,
        );
      }
    }
  }
  if (
    input.nextStatus !== undefined &&
    input.nextStatus !== input.previousStatus
  ) {
    lines.push(
      `Status alterado de «${MAINTENANCE_STATUS_LABELS_PT[input.previousStatus]}» para «${MAINTENANCE_STATUS_LABELS_PT[input.nextStatus]}».`,
    );
  }
  return lines.length ? lines.join('\n') : null;
}

function buildTimelineEntryUpdateAuditBody(input: {
  previousBody: string | null;
  previousCreatedAt: Date;
  nextBody?: string | null;
  nextCreatedAt?: Date;
}): string | null {
  const lines: string[] = [];
  if (input.nextCreatedAt !== undefined) {
    const oldMs = input.previousCreatedAt.getTime();
    const newMs = input.nextCreatedAt.getTime();
    if (oldMs !== newMs) {
      lines.push(
        `Data/hora alterada de ${formatTimelineInstantPt(input.previousCreatedAt)} para ${formatTimelineInstantPt(input.nextCreatedAt)}.`,
      );
    }
  }
  if (input.nextBody !== undefined) {
    const oldText = (input.previousBody ?? '').trim();
    const newText = (input.nextBody ?? '').trim();
    if (oldText !== newText) {
      if (!oldText && newText) {
        lines.push('Texto adicionado.');
      } else if (oldText && !newText) {
        lines.push('Texto removido.');
      } else {
        lines.push('Texto atualizado.');
      }
    }
  }
  if (!lines.length) {
    return null;
  }
  return `Comentário na timeline:\n${lines.join('\n')}`;
}

@Injectable()
export class CondominiumMaintenancesService {
  constructor(
    @InjectRepository(CondominiumMaintenance)
    private readonly maintenanceRepo: Repository<CondominiumMaintenance>,
    @InjectRepository(CondominiumMaintenanceTimelineAttachment)
    private readonly timelineAttachmentRepo: Repository<CondominiumMaintenanceTimelineAttachment>,
    @InjectRepository(CondominiumMaintenanceTimelineEntry)
    private readonly entryRepo: Repository<CondominiumMaintenanceTimelineEntry>,
    @InjectRepository(FinancialTransaction)
    private readonly financialTxRepo: Repository<FinancialTransaction>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly governance: GovernanceService,
    private readonly suppliers: CondominiumSuppliersService,
    private readonly config: ConfigService,
    @Inject(WORK_DOCUMENT_STORAGE)
    private readonly workStorage: WorkDocumentStoragePort,
  ) {}

  async list(
    condominiumId: string,
    userId: string,
  ): Promise<MaintenanceListItemDto[]> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const maintenances = await this.maintenanceRepo.find({
      where: { condominiumId },
    });
    if (maintenances.length === 0) {
      return [];
    }
    const maintenanceIds = maintenances.map((m) => m.id);
    const lastRows = await this.entryRepo
      .createQueryBuilder('e')
      .select('e.maintenanceId', 'maintenanceId')
      .addSelect('MAX(e.createdAt)', 'lastAt')
      .where('e.maintenanceId IN (:...maintenanceIds)', { maintenanceIds })
      .groupBy('e.maintenanceId')
      .getRawMany<{ maintenanceId: string; lastAt: Date | string | null }>();
    const lastByMaintenance = new Map(
      lastRows.map((r) => [
        r.maintenanceId,
        r.lastAt ? new Date(r.lastAt) : null,
      ]),
    );
    return maintenances
      .map((m) => this.toListItem(m, lastByMaintenance.get(m.id) ?? null))
      .sort(compareMaintenancesForList);
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateMaintenanceDto,
  ): Promise<MaintenanceDetailDto> {
    await this.governance.assertManagement(condominiumId, userId);
    const status = dto.status ?? MaintenanceStatus.Open;
    const supplierFields = await this.resolveSupplierFields(
      condominiumId,
      userId,
      dto,
      false,
    );
    const maintenance = this.maintenanceRepo.create({
      id: randomUUID(),
      condominiumId,
      title: dto.title.trim(),
      description: (dto.description ?? '').trim() || null,
      location: (dto.location ?? '').trim() || null,
      replacedParts: (dto.replacedParts ?? '').trim() || null,
      supplierId: supplierFields.supplierId,
      supplierName: supplierFields.supplierName,
      status,
      createdByUserId: userId,
    });
    await this.maintenanceRepo.save(maintenance);
    await this.recordEditTimelineEntry(
      maintenance.id,
      userId,
      buildMaintenanceCreateAuditBody(maintenance.status),
    );
    return this.getOne(condominiumId, maintenance.id, userId);
  }

  async getOne(
    condominiumId: string,
    maintenanceId: string,
    userId: string,
    includeFileUrls = false,
  ): Promise<MaintenanceDetailDto> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const maintenance = await this.findMaintenanceOrThrow(
      condominiumId,
      maintenanceId,
    );
    const [timeline, costsSummary] = await Promise.all([
      this.loadTimeline(condominiumId, maintenanceId, includeFileUrls),
      this.loadCostsSummary(condominiumId, maintenanceId),
    ]);
    const lastAt = timeline[0] ? new Date(timeline[0].createdAt) : null;
    return {
      ...this.toListItem(maintenance, lastAt),
      timeline,
      costsSummary,
    };
  }

  async update(
    condominiumId: string,
    maintenanceId: string,
    userId: string,
    dto: UpdateMaintenanceDto,
  ): Promise<MaintenanceDetailDto> {
    await this.governance.assertManagement(condominiumId, userId);
    const maintenance = await this.findMaintenanceOrThrow(
      condominiumId,
      maintenanceId,
    );
    const previous = {
      title: maintenance.title,
      description: maintenance.description,
      location: maintenance.location,
      replacedParts: maintenance.replacedParts,
      supplierName: maintenance.supplierName,
      status: maintenance.status,
    };
    if (dto.title !== undefined) {
      maintenance.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      maintenance.description = (dto.description ?? '').trim() || null;
    }
    if (dto.location !== undefined) {
      maintenance.location = (dto.location ?? '').trim() || null;
    }
    if (dto.replacedParts !== undefined) {
      maintenance.replacedParts = (dto.replacedParts ?? '').trim() || null;
    }
    if (dto.status !== undefined) {
      maintenance.status = dto.status;
    }
    if (dto.supplierId !== undefined || dto.supplierName !== undefined) {
      await this.applySupplierPatch(condominiumId, userId, maintenance, dto);
    }
    const auditBody = buildMaintenanceUpdateAuditBody({
      previousTitle: previous.title,
      previousDescription: previous.description,
      previousLocation: previous.location,
      previousReplacedParts: previous.replacedParts,
      previousSupplierName: previous.supplierName,
      previousStatus: previous.status,
      nextTitle: dto.title !== undefined ? maintenance.title : undefined,
      nextDescription:
        dto.description !== undefined ? maintenance.description : undefined,
      nextLocation: dto.location !== undefined ? maintenance.location : undefined,
      nextReplacedParts:
        dto.replacedParts !== undefined ? maintenance.replacedParts : undefined,
      nextSupplierName:
        dto.supplierId !== undefined || dto.supplierName !== undefined
          ? maintenance.supplierName
          : undefined,
      nextStatus: dto.status,
    });
    await this.maintenanceRepo.save(maintenance);
    if (auditBody) {
      await this.recordEditTimelineEntry(maintenanceId, userId, auditBody);
    }
    return this.getOne(condominiumId, maintenanceId, userId);
  }

  async remove(
    condominiumId: string,
    maintenanceId: string,
    userId: string,
  ): Promise<void> {
    await this.governance.assertManagement(condominiumId, userId);
    const maintenance = await this.findMaintenanceOrThrow(
      condominiumId,
      maintenanceId,
    );
    const entries = await this.entryRepo.find({
      where: { maintenanceId },
      relations: { attachments: true },
    });
    for (const e of entries) {
      for (const a of e.attachments ?? []) {
        await this.workStorage.deleteWorkDocument(condominiumId, a.storageKey);
      }
      if (e.storageKey) {
        await this.workStorage.deleteWorkDocument(condominiumId, e.storageKey);
      }
    }
    await this.maintenanceRepo.delete({ id: maintenance.id });
  }

  async addNote(
    condominiumId: string,
    maintenanceId: string,
    userId: string,
    bodyRaw: Record<string, unknown>,
    files: Express.Multer.File[] = [],
  ): Promise<MaintenanceTimelineEntryDto> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findMaintenanceOrThrow(condominiumId, maintenanceId);
    const dto = parseCreateTimelineNoteBody(bodyRaw);
    const list = files.filter((f) => f?.buffer?.length);
    assertNoteHasContent(dto, list.length);
    const body = (dto.body ?? '').trim() || null;
    const authorDisplayName = await this.resolveDisplayName(userId);
    const recordedAt = resolveTimelineRecordedAt(
      resolveRecordedOnWithFilenameFallback(
        dto.recordedOn,
        list.map((f) =>
          encodeUploadOriginalFilename(f.originalname || 'anexo'),
        ),
      ),
    );
    const entry = this.entryRepo.create({
      id: randomUUID(),
      maintenanceId,
      kind: MaintenanceTimelineKind.Note,
      body,
      authorUserId: userId,
      authorDisplayName,
      createdAt: recordedAt,
    });
    await this.entryRepo.save(entry);
    entry.attachments = await this.saveEntryAttachments(
      condominiumId,
      maintenanceId,
      entry.id,
      list,
    );
    await this.touchMaintenance(maintenanceId);
    return await this.mapEntry(condominiumId, entry);
  }

  async updateTimelineEntry(
    condominiumId: string,
    maintenanceId: string,
    entryId: string,
    userId: string,
    dto: UpdateMaintenanceTimelineEntryDto,
  ): Promise<MaintenanceTimelineEntryDto> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findMaintenanceOrThrow(condominiumId, maintenanceId);

    const hasBody = dto.body !== undefined;
    const hasRecordedOn =
      dto.recordedOn !== undefined && dto.recordedOn.trim().length > 0;
    if (!hasBody && !hasRecordedOn) {
      throw new BadRequestException(
        'Informe ao menos um campo para atualizar.',
      );
    }

    const entry = await this.entryRepo.findOne({
      where: { id: entryId, maintenanceId },
      relations: { attachments: true },
    });
    if (!entry) {
      throw new NotFoundException('Registro não encontrado.');
    }
    if (entry.kind !== MaintenanceTimelineKind.Note) {
      throw new BadRequestException(
        'Só é possível editar comentários na timeline.',
      );
    }

    const previousBody = entry.body;
    const previousCreatedAt = new Date(entry.createdAt);

    let nextBody: string | null | undefined;
    if (hasBody) {
      nextBody = (dto.body ?? '').trim() || null;
      const attachmentCount = entry.attachments?.length ?? 0;
      if (!nextBody && attachmentCount < 1) {
        throw new BadRequestException(
          'O comentário precisa de texto ou ao menos um anexo.',
        );
      }
      entry.body = nextBody;
    }

    let nextCreatedAt: Date | undefined;
    if (hasRecordedOn) {
      nextCreatedAt = resolveTimelineRecordedAt(dto.recordedOn!.trim());
      entry.createdAt = nextCreatedAt;
    }

    const timelineAuditBody = buildTimelineEntryUpdateAuditBody({
      previousBody,
      previousCreatedAt,
      nextBody: hasBody ? nextBody! : undefined,
      nextCreatedAt,
    });

    await this.entryRepo.save(entry);

    if (timelineAuditBody) {
      await this.recordEditTimelineEntry(
        maintenanceId,
        userId,
        timelineAuditBody,
      );
    } else {
      await this.touchMaintenance(maintenanceId);
    }

    return await this.mapEntry(condominiumId, entry);
  }

  async removeTimelineEntry(
    condominiumId: string,
    maintenanceId: string,
    entryId: string,
    userId: string,
  ): Promise<void> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findMaintenanceOrThrow(condominiumId, maintenanceId);
    const entry = await this.entryRepo.findOne({
      where: { id: entryId, maintenanceId },
      relations: { attachments: true },
    });
    if (!entry) {
      throw new NotFoundException('Registro não encontrado.');
    }
    if (entry.kind === MaintenanceTimelineKind.Transaction) {
      throw new BadRequestException(
        'Lançamentos financeiros são removidos da timeline ao desvincular a manutenção em Transações.',
      );
    }
    if (entry.kind !== MaintenanceTimelineKind.Note) {
      throw new BadRequestException(
        'Só é possível remover comentários da timeline.',
      );
    }
    for (const a of entry.attachments ?? []) {
      await this.workStorage.deleteWorkDocument(condominiumId, a.storageKey);
    }
    if (entry.storageKey) {
      await this.workStorage.deleteWorkDocument(condominiumId, entry.storageKey);
    }
    await this.entryRepo.delete({ id: entry.id });
    await this.touchMaintenance(maintenanceId);
  }

  async readTimelineAttachmentFile(
    condominiumId: string,
    maintenanceId: string,
    entryId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    await this.findMaintenanceOrThrow(condominiumId, maintenanceId);
    if (attachmentId === entryId) {
      const legacy = await this.entryRepo.findOne({
        where: {
          id: entryId,
          maintenanceId,
          kind: MaintenanceTimelineKind.Document,
        },
      });
      if (legacy?.storageKey) {
        return this.readTimelineLegacyFile(
          condominiumId,
          maintenanceId,
          entryId,
          userId,
        );
      }
    }
    const att = await this.timelineAttachmentRepo.findOne({
      where: { id: attachmentId, entryId },
      relations: { entry: true },
    });
    if (!att || att.entry.maintenanceId !== maintenanceId) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    if (!this.workStorage.isValidWorkDocumentKey(att.storageKey)) {
      throw new BadRequestException('Chave de arquivo inválida.');
    }
    const read = await this.workStorage.readWorkDocument(
      condominiumId,
      att.storageKey,
    );
    const safeName = sanitizeDownloadFilename(
      repairMojibakeUtf8Filename(att.originalFilename?.trim() || read.filename),
    );
    return { ...read, filename: safeName };
  }

  /** @deprecated Documentos legados gravados na própria entrada. */
  async readTimelineLegacyFile(
    condominiumId: string,
    maintenanceId: string,
    entryId: string,
    userId: string,
  ) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    await this.findMaintenanceOrThrow(condominiumId, maintenanceId);
    const entry = await this.entryRepo.findOne({
      where: {
        id: entryId,
        maintenanceId,
        kind: MaintenanceTimelineKind.Document,
      },
    });
    if (!entry?.storageKey) {
      throw new NotFoundException('Documento não encontrado.');
    }
    if (!this.workStorage.isValidWorkDocumentKey(entry.storageKey)) {
      throw new BadRequestException('Chave de arquivo inválida.');
    }
    const read = await this.workStorage.readWorkDocument(
      condominiumId,
      entry.storageKey,
    );
    const safeName = sanitizeDownloadFilename(
      repairMojibakeUtf8Filename(
        entry.originalFilename?.trim() || read.filename,
      ),
    );
    return { ...read, filename: safeName };
  }

  private async findMaintenanceOrThrow(
    condominiumId: string,
    maintenanceId: string,
  ): Promise<CondominiumMaintenance> {
    const maintenance = await this.maintenanceRepo.findOne({
      where: { id: maintenanceId, condominiumId },
    });
    if (!maintenance) {
      throw new NotFoundException('Manutenção não encontrada.');
    }
    return maintenance;
  }

  private async touchMaintenance(maintenanceId: string): Promise<void> {
    await this.maintenanceRepo.update(
      { id: maintenanceId },
      { updatedAt: new Date() },
    );
  }

  private async recordEditTimelineEntry(
    maintenanceId: string,
    userId: string,
    body: string,
  ): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    const authorDisplayName = await this.resolveDisplayName(userId);
    const entry = this.entryRepo.create({
      id: randomUUID(),
      maintenanceId,
      kind: MaintenanceTimelineKind.Edit,
      body: trimmed,
      authorUserId: userId,
      authorDisplayName,
    });
    await this.entryRepo.save(entry);
    await this.touchMaintenance(maintenanceId);
  }

  private async loadTimeline(
    condominiumId: string,
    maintenanceId: string,
    includeFileUrls = false,
  ): Promise<MaintenanceTimelineEntryDto[]> {
    const entries = await this.entryRepo.find({
      where: { maintenanceId },
      relations: { attachments: true, financialTransaction: true },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      entries.map((e) => this.mapEntry(condominiumId, e, includeFileUrls)),
    );
  }

  private async loadCostsSummary(
    condominiumId: string,
    maintenanceId: string,
  ): Promise<MaintenanceCostsSummaryDto> {
    const todayYmd = formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon());
    const expenseRaw = await this.financialTxRepo
      .createQueryBuilder('t')
      .select(
        `COALESCE(SUM(CASE WHEN t.payment_status = 'paid' THEN t.amount_cents ELSE 0 END), 0)`,
        'paidTotal',
      )
      .addSelect(
        `COUNT(CASE WHEN t.payment_status = 'paid' THEN 1 END)`,
        'paidCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.payment_status = 'pending' AND t.occurred_on < :todayYmd THEN t.amount_cents ELSE 0 END), 0)`,
        'overdueTotal',
      )
      .addSelect(
        `COUNT(CASE WHEN t.payment_status = 'pending' AND t.occurred_on < :todayYmd THEN 1 END)`,
        'overdueCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.payment_status = 'pending' AND t.occurred_on >= :todayYmd THEN t.amount_cents ELSE 0 END), 0)`,
        'futureTotal',
      )
      .addSelect(
        `COUNT(CASE WHEN t.payment_status = 'pending' AND t.occurred_on >= :todayYmd THEN 1 END)`,
        'futureCount',
      )
      .where('t.condominium_id = :condominiumId', { condominiumId })
      .andWhere('t.maintenance_id = :maintenanceId', { maintenanceId })
      .andWhere('t.kind = :kind', { kind: 'expense' })
      .andWhere('t.payment_status != :cancelled', { cancelled: 'cancelled' })
      .setParameter('todayYmd', todayYmd)
      .getRawOne<{
        paidTotal: string | number | null;
        paidCount: string | number | null;
        overdueTotal: string | number | null;
        overdueCount: string | number | null;
        futureTotal: string | number | null;
        futureCount: string | number | null;
      }>();

    const paidCents = Number(expenseRaw?.paidTotal ?? 0);
    const paidCount = Number(expenseRaw?.paidCount ?? 0);
    const overdueCents = Number(expenseRaw?.overdueTotal ?? 0);
    const overdueCount = Number(expenseRaw?.overdueCount ?? 0);
    const futureCents = Number(expenseRaw?.futureTotal ?? 0);
    const futureCount = Number(expenseRaw?.futureCount ?? 0);
    const forecastCents = paidCents + overdueCents + futureCents;
    const expenseCount = paidCount + overdueCount + futureCount;

    return {
      totalCents: String(forecastCents),
      forecastCents: String(forecastCents),
      expenseCount: Number.isFinite(expenseCount) ? expenseCount : 0,
      paidCents: String(paidCents),
      paidCount: Number.isFinite(paidCount) ? paidCount : 0,
      overdueCents: String(overdueCents),
      overdueCount: Number.isFinite(overdueCount) ? overdueCount : 0,
      futureCents: String(futureCents),
      futureCount: Number.isFinite(futureCount) ? futureCount : 0,
    };
  }

  private toListItem(
    m: CondominiumMaintenance,
    lastActivityAt: Date | null,
  ): MaintenanceListItemDto {
    return {
      id: m.id,
      condominiumId: m.condominiumId,
      title: m.title,
      description: m.description,
      location: m.location,
      replacedParts: m.replacedParts,
      supplierId: m.supplierId,
      supplierName: m.supplierName,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      lastActivityAt: lastActivityAt?.toISOString() ?? null,
    };
  }

  private async saveEntryAttachments(
    condominiumId: string,
    maintenanceId: string,
    entryId: string,
    files: Express.Multer.File[],
  ): Promise<CondominiumMaintenanceTimelineAttachment[]> {
    const list = files.filter((f) => f?.buffer?.length);
    if (list.length > 0 && usesLocalDiskOnly(this.config)) {
      const db = this.config.get<string>('DATABASE_URL') ?? '';
      const likelyRemoteDb =
        /@[^/]+:\d+\//.test(db) && !/localhost|127\.0\.0\.1/i.test(db);
      if (likelyRemoteDb) {
        throw new BadRequestException(
          'Anexos de manutenções não podem ser gravados só no disco desta máquina enquanto a API usa base de dados remota. No .env da API, configure STORAGE_DRIVER=nextcloud (NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_APP_PASSWORD) ou STORAGE_API_* para o mesmo storage usado em produção.',
        );
      }
    }
    const saved: CondominiumMaintenanceTimelineAttachment[] = [];
    for (const file of list) {
      const originalFilename = encodeUploadOriginalFilename(
        file.originalname || 'anexo',
      ).slice(0, 255);
      const storageKey = await this.workStorage.saveWorkDocument(
        condominiumId,
        maintenanceId,
        file.buffer,
        file.mimetype || 'application/octet-stream',
        originalFilename,
      );
      const att = this.timelineAttachmentRepo.create({
        id: randomUUID(),
        entryId,
        storageKey,
        originalFilename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      });
      await this.timelineAttachmentRepo.save(att);
      saved.push(att);
    }
    return saved;
  }

  private async resolveSupplierFields(
    condominiumId: string,
    userId: string,
    input: Pick<CreateMaintenanceDto, 'supplierId' | 'supplierName'>,
    required: boolean,
  ): Promise<{ supplierId: string | null; supplierName: string | null }> {
    const supplierId = input.supplierId?.trim();
    if (supplierId) {
      const supplier = await this.suppliers.resolveForBudgetLink(
        condominiumId,
        userId,
        supplierId,
      );
      return { supplierId: supplier.id, supplierName: supplier.name };
    }
    const supplierName = (input.supplierName ?? '').trim();
    if (supplierName) {
      const supplier = await this.suppliers.ensureByName(
        condominiumId,
        userId,
        supplierName,
      );
      return { supplierId: supplier.id, supplierName: supplier.name };
    }
    if (required) {
      throw new BadRequestException(
        'Informe o fornecedor ou selecione um cadastrado.',
      );
    }
    return { supplierId: null, supplierName: null };
  }

  private async applySupplierPatch(
    condominiumId: string,
    userId: string,
    maintenance: CondominiumMaintenance,
    dto: Pick<UpdateMaintenanceDto, 'supplierId' | 'supplierName'>,
  ): Promise<void> {
    if (dto.supplierId !== undefined) {
      if (dto.supplierId === null) {
        if (dto.supplierName !== undefined) {
          const name = (dto.supplierName ?? '').trim();
          if (!name) {
            maintenance.supplierId = null;
            maintenance.supplierName = null;
          } else {
            const supplier = await this.suppliers.ensureByName(
              condominiumId,
              userId,
              name,
            );
            maintenance.supplierId = supplier.id;
            maintenance.supplierName = supplier.name;
          }
        } else {
          maintenance.supplierId = null;
          maintenance.supplierName = null;
        }
        return;
      }
      const resolved = await this.resolveSupplierFields(
        condominiumId,
        userId,
        { supplierId: dto.supplierId },
        true,
      );
      maintenance.supplierId = resolved.supplierId;
      maintenance.supplierName = resolved.supplierName;
      return;
    }
    if (dto.supplierName !== undefined) {
      const name = (dto.supplierName ?? '').trim();
      if (!name) {
        maintenance.supplierId = null;
        maintenance.supplierName = null;
        return;
      }
      const supplier = await this.suppliers.ensureByName(
        condominiumId,
        userId,
        name,
      );
      maintenance.supplierId = supplier.id;
      maintenance.supplierName = supplier.name;
    }
  }

  private async resolveAttachmentFileUrl(
    condominiumId: string,
    storageKey: string | null | undefined,
  ): Promise<string | null> {
    if (!storageKey || !this.workStorage.isValidWorkDocumentKey(storageKey)) {
      return null;
    }
    const resolve = this.workStorage.resolveWorkDocumentPublicUrl;
    if (typeof resolve !== 'function') {
      return null;
    }
    return resolve.call(this.workStorage, condominiumId, storageKey);
  }

  private async mapEntryAttachments(
    condominiumId: string,
    e: CondominiumMaintenanceTimelineEntry,
    includeFileUrls: boolean,
  ): Promise<MaintenanceTimelineAttachmentDto[]> {
    const list: MaintenanceTimelineAttachmentDto[] = (
      e.attachments ?? []
    ).map((a) => ({
      id: a.id,
      originalFilename: repairMojibakeUtf8Filename(a.originalFilename),
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      fileUrl: null as string | null,
    }));
    if (
      e.kind === MaintenanceTimelineKind.Document &&
      e.storageKey &&
      !list.some((a) => a.id === e.id)
    ) {
      list.unshift({
        id: e.id,
        originalFilename: repairMojibakeUtf8Filename(
          e.originalFilename ?? 'documento',
        ),
        mimeType: e.mimeType ?? null,
        sizeBytes: e.sizeBytes ?? null,
        fileUrl: null,
      });
    }
    if (!includeFileUrls) {
      return list;
    }
    await Promise.all(
      list.map(async (row) => {
        const key =
          row.id === e.id && e.kind === MaintenanceTimelineKind.Document
            ? e.storageKey
            : (e.attachments ?? []).find((a) => a.id === row.id)?.storageKey;
        row.fileUrl = await this.resolveAttachmentFileUrl(condominiumId, key);
      }),
    );
    return list;
  }

  private mapTransactionEntry(
    e: CondominiumMaintenanceTimelineEntry,
  ): MaintenanceTimelineTransactionDto | null {
    const tx = e.financialTransaction;
    if (!tx) {
      return null;
    }
    return {
      id: tx.id,
      kind: tx.kind,
      title: tx.title,
      amountCents: String(tx.amountCents),
      occurredOn: formatDateOnlyYmdUtc(tx.occurredOn),
      paymentStatus: tx.paymentStatus,
    };
  }

  private async mapEntry(
    condominiumId: string,
    e: CondominiumMaintenanceTimelineEntry,
    includeFileUrls = false,
  ): Promise<MaintenanceTimelineEntryDto> {
    return {
      id: e.id,
      kind: e.kind,
      body: e.body,
      attachments: await this.mapEntryAttachments(
        condominiumId,
        e,
        includeFileUrls,
      ),
      authorUserId: e.authorUserId,
      authorDisplayName: e.authorDisplayName,
      createdAt: e.createdAt.toISOString(),
      financialTransactionId: e.financialTransactionId ?? null,
      transaction:
        e.kind === MaintenanceTimelineKind.Transaction
          ? this.mapTransactionEntry(e)
          : null,
    };
  }

  private async resolveDisplayName(userId: string): Promise<string> {
    const person = await this.personRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const personName = person?.fullName?.trim();
    if (personName) {
      return personName.slice(0, 255);
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return (user?.email?.trim() || 'Usuário').slice(0, 255);
  }
}

