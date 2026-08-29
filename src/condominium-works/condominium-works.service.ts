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
import { Person } from '../people/person.entity';
import { GovernanceService } from '../planning/governance.service';
import {
  encodeUploadOriginalFilename,
  repairMojibakeUtf8Filename,
} from '../planning/upload-filename-encoding.util';
import { usesLocalDiskOnly } from '../storage/storage-driver.util';
import type { WorkDocumentStoragePort } from '../storage/work-document-storage.port';
import { WORK_DOCUMENT_STORAGE } from '../storage/storage.tokens';
import { User } from '../users/user.entity';
import { CreateTimelineNoteDto } from './dto/create-timeline-note.dto';
import { resolveBudgetScheduledAt } from './dto/parse-budget-scheduled-at';
import { resolveTimelineRecordedAt } from './dto/parse-timeline-recorded-on';
import { resolveRecordedOnWithFilenameFallback } from './utils/filename-recorded-on.util';
import { formatBudgetTimelineSummary } from './utils/work-budget-summary.util';
import { CondominiumSuppliersService } from './condominium-suppliers.service';
import { CreateWorkBudgetDto } from './dto/create-work-budget.dto';
import { CreateWorkDto } from './dto/create-work.dto';
import { UpdateWorkBudgetDto } from './dto/update-work-budget.dto';
import { UpdateTimelineEntryDto } from './dto/update-timeline-entry.dto';
import { UpdateWorkDto } from './dto/update-work.dto';
import {
  assertNoteHasContent,
  parseCreateTimelineNoteBody,
} from './dto/parse-create-timeline-note-body';
import {
  assertLegalHasContent,
  parseCreateTimelineLegalBody,
} from './dto/parse-create-timeline-legal-body';
import { CondominiumWorkBudget } from './entities/condominium-work-budget.entity';
import { CondominiumWorkTimelineAttachment } from './entities/condominium-work-timeline-attachment.entity';
import { CondominiumWorkTimelineEntry } from './entities/condominium-work-timeline-entry.entity';
import { CondominiumWork } from './entities/condominium-work.entity';
import { WorkBudgetStatus } from './enums/work-budget-status.enum';
import { WorkStatus } from './enums/work-status.enum';
import { sanitizeDownloadFilename } from '../common/http-content-disposition.util';
import {
  formatDateOnlyYmdUtc,
  todayLocalCalendarAsUtcNoon,
} from '../finance/date-only.util';
import { FinancialTransaction } from '../finance/entities/financial-transaction.entity';
import { WorkTimelineKind } from './enums/work-timeline-kind.enum';
import {
  DEFAULT_WORK_ALLOCATION_RULE,
  getWorkAllocationRule,
  parseWorkAllocationRuleInput,
} from './work-allocation.util';
import type { AllocationRule } from '../finance/allocation.types';
import {
  buildBudgetUpdateAuditBody,
  buildTimelineEntryUpdateAuditBody,
  buildWorkCreateAuditBody,
  buildWorkUpdateAuditBody,
} from './work-timeline-edit.util';

export type WorkTimelineAttachmentDto = {
  id: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** URL no storage (ex. storage.meucondominio.cloud); null = usar download via API. */
  fileUrl: string | null;
};

export type WorkBudgetDto = {
  id: string;
  supplierId: string | null;
  supplierName: string;
  title: string | null;
  amountCents: number;
  validUntil: string | null;
  scheduledAt: string | null;
  status: WorkBudgetStatus;
  notes: string | null;
  createdAt: string;
};

export type WorkTimelineTransactionDto = {
  id: string;
  kind: string;
  title: string;
  amountCents: string;
  occurredOn: string;
  paymentStatus: string;
};

export type WorkTimelineEntryDto = {
  id: string;
  kind: WorkTimelineKind;
  body: string | null;
  budget: WorkBudgetDto | null;
  attachments: WorkTimelineAttachmentDto[];
  authorUserId: string;
  authorDisplayName: string;
  createdAt: string;
  financialTransactionId: string | null;
  transaction: WorkTimelineTransactionDto | null;
};

export type WorkListItemDto = {
  id: string;
  condominiumId: string;
  title: string;
  description: string | null;
  status: WorkStatus;
  queueOrder: number;
  allocationRule: AllocationRule;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
};

function isActiveWorkStatus(status: WorkStatus): boolean {
  return status === WorkStatus.Planned || status === WorkStatus.InProgress;
}

function workStatusSectionRank(status: WorkStatus): number {
  if (isActiveWorkStatus(status)) {
    return 0;
  }
  if (status === WorkStatus.Completed) {
    return 1;
  }
  return 2;
}

function compareWorksForList(a: WorkListItemDto, b: WorkListItemDto): number {
  const ra = workStatusSectionRank(a.status);
  const rb = workStatusSectionRank(b.status);
  if (ra !== rb) {
    return ra - rb;
  }
  if (ra === 0 && a.queueOrder !== b.queueOrder) {
    return a.queueOrder - b.queueOrder;
  }
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export type WorkCostsSummaryDto = {
  /**
   * Total previsto (pago + atrasado + futuro), centavos.
   * Mantido como `totalCents` por compatibilidade com o front.
   */
  totalCents: string;
  forecastCents: string;
  expenseCount: number;
  paidCents: string;
  paidCount: number;
  /** Pendentes com data da transação anterior a hoje. */
  overdueCents: string;
  overdueCount: number;
  /** Pendentes com data da transação hoje ou futura. */
  futureCents: string;
  futureCount: number;
  /** Soma dos orçamentos aprovados (centavos). */
  approvedBudgetCents: string | null;
  approvedBudgetCount: number;
  /** Fornecedores dos orçamentos aprovados (texto para exibição). */
  approvedBudgetSuppliers: string | null;
  budgetCount: number;
  /** Previsto ÷ soma dos aprovados (0–100+); null sem orçamento aprovado. */
  progressPercent: number | null;
};

export type WorkDetailDto = WorkListItemDto & {
  timeline: WorkTimelineEntryDto[];
  costsSummary: WorkCostsSummaryDto;
};

@Injectable()
export class CondominiumWorksService {
  constructor(
    @InjectRepository(CondominiumWork)
    private readonly workRepo: Repository<CondominiumWork>,
    @InjectRepository(CondominiumWorkBudget)
    private readonly budgetRepo: Repository<CondominiumWorkBudget>,
    @InjectRepository(CondominiumWorkTimelineAttachment)
    private readonly timelineAttachmentRepo: Repository<CondominiumWorkTimelineAttachment>,
    @InjectRepository(CondominiumWorkTimelineEntry)
    private readonly entryRepo: Repository<CondominiumWorkTimelineEntry>,
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

  async list(condominiumId: string, userId: string): Promise<WorkListItemDto[]> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const works = await this.workRepo.find({
      where: { condominiumId },
    });
    if (works.length === 0) {
      return [];
    }
    const workIds = works.map((w) => w.id);
    const lastRows = await this.entryRepo
      .createQueryBuilder('e')
      .select('e.workId', 'workId')
      .addSelect('MAX(e.createdAt)', 'lastAt')
      .where('e.workId IN (:...workIds)', { workIds })
      .groupBy('e.workId')
      .getRawMany<{ workId: string; lastAt: Date | string | null }>();
    const lastByWork = new Map(
      lastRows.map((r) => [
        r.workId,
        r.lastAt ? new Date(r.lastAt) : null,
      ]),
    );
    return works
      .map((w) => this.toListItem(w, lastByWork.get(w.id) ?? null))
      .sort(compareWorksForList);
  }

  async reorderQueue(
    condominiumId: string,
    userId: string,
    workIds: string[],
  ): Promise<WorkListItemDto[]> {
    await this.governance.assertManagement(condominiumId, userId);
    const unique = [...new Set(workIds)];
    if (unique.length !== workIds.length) {
      throw new BadRequestException('Lista de obras com IDs duplicados.');
    }
    const works = await this.workRepo.find({ where: { condominiumId } });
    const byId = new Map(works.map((w) => [w.id, w]));
    for (const id of workIds) {
      const w = byId.get(id);
      if (!w) {
        throw new NotFoundException('Obra não encontrada neste condomínio.');
      }
      if (!isActiveWorkStatus(w.status)) {
        throw new BadRequestException(
          'Só é possível reordenar obras planejadas ou em andamento.',
        );
      }
    }
    const activeIds = works
      .filter((w) => isActiveWorkStatus(w.status))
      .map((w) => w.id);
    if (workIds.length !== activeIds.length) {
      throw new BadRequestException(
        'Informe todas as obras planejadas e em andamento na nova ordem.',
      );
    }
    await this.workRepo.manager.transaction(async (em) => {
      for (let i = 0; i < workIds.length; i++) {
        await em.update(CondominiumWork, { id: workIds[i] }, { queueOrder: i });
      }
    });
    return this.list(condominiumId, userId);
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateWorkDto,
  ): Promise<WorkDetailDto> {
    await this.governance.assertManagement(condominiumId, userId);
    const status = dto.status ?? WorkStatus.Planned;
    const queueOrder = isActiveWorkStatus(status)
      ? await this.nextQueueOrder(condominiumId)
      : 0;
    const allocationRule = dto.allocationRule
      ? parseWorkAllocationRuleInput(dto.allocationRule)
      : DEFAULT_WORK_ALLOCATION_RULE;
    const work = this.workRepo.create({
      id: randomUUID(),
      condominiumId,
      title: dto.title.trim(),
      description: (dto.description ?? '').trim() || null,
      status,
      queueOrder,
      allocationRule,
      createdByUserId: userId,
    });
    await this.workRepo.save(work);
    await this.recordEditTimelineEntry(
      work.id,
      userId,
      buildWorkCreateAuditBody(work.status),
    );
    return this.getOne(condominiumId, work.id, userId);
  }

  async getOne(
    condominiumId: string,
    workId: string,
    userId: string,
    includeFileUrls = false,
  ): Promise<WorkDetailDto> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const work = await this.findWorkOrThrow(condominiumId, workId);
    const [timeline, costsSummary] = await Promise.all([
      this.loadTimeline(condominiumId, workId, includeFileUrls),
      this.loadCostsSummary(condominiumId, workId),
    ]);
    const lastAt = timeline[0]
      ? new Date(timeline[0].createdAt)
      : null;
    return {
      ...this.toListItem(work, lastAt),
      timeline,
      costsSummary,
    };
  }

  async update(
    condominiumId: string,
    workId: string,
    userId: string,
    dto: UpdateWorkDto,
  ): Promise<WorkDetailDto> {
    await this.governance.assertManagement(condominiumId, userId);
    const work = await this.findWorkOrThrow(condominiumId, workId);
    const auditBody = buildWorkUpdateAuditBody({
      previousTitle: work.title,
      previousDescription: work.description,
      previousStatus: work.status,
      nextTitle: dto.title !== undefined ? dto.title.trim() : undefined,
      nextDescription:
        dto.description !== undefined
          ? (dto.description ?? '').trim() || null
          : undefined,
      nextStatus: dto.status,
    });
    if (dto.title !== undefined) {
      work.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      work.description = (dto.description ?? '').trim() || null;
    }
    if (dto.status !== undefined) {
      const wasActive = isActiveWorkStatus(work.status);
      const willBeActive = isActiveWorkStatus(dto.status);
      work.status = dto.status;
      if (!wasActive && willBeActive) {
        work.queueOrder = await this.nextQueueOrder(condominiumId);
      }
    }
    if (dto.allocationRule !== undefined) {
      work.allocationRule = parseWorkAllocationRuleInput(dto.allocationRule);
    }
    await this.workRepo.save(work);
    if (auditBody) {
      await this.recordEditTimelineEntry(workId, userId, auditBody);
    }
    return this.getOne(condominiumId, workId, userId);
  }

  async remove(
    condominiumId: string,
    workId: string,
    userId: string,
  ): Promise<void> {
    await this.governance.assertManagement(condominiumId, userId);
    const work = await this.findWorkOrThrow(condominiumId, workId);
    const entries = await this.entryRepo.find({
      where: { workId },
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
    await this.workRepo.delete({ id: work.id });
  }

  async addNote(
    condominiumId: string,
    workId: string,
    userId: string,
    bodyRaw: Record<string, unknown>,
    files: Express.Multer.File[] = [],
  ): Promise<WorkTimelineEntryDto> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);
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
      workId,
      kind: WorkTimelineKind.Note,
      body,
      authorUserId: userId,
      authorDisplayName,
      createdAt: recordedAt,
    });
    await this.entryRepo.save(entry);
    entry.attachments = await this.saveEntryAttachments(
      condominiumId,
      workId,
      entry.id,
      list,
    );
    await this.touchWork(workId);
    return await this.mapEntry(condominiumId, entry, null);
  }

  async addLegal(
    condominiumId: string,
    workId: string,
    userId: string,
    bodyRaw: Record<string, unknown>,
    files: Express.Multer.File[] = [],
  ): Promise<WorkTimelineEntryDto> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);
    const dto = parseCreateTimelineLegalBody(bodyRaw);
    const list = files.filter((f) => f?.buffer?.length);
    assertLegalHasContent(dto, list.length);
    const title = (dto.body ?? '').trim();
    const body =
      title.length > 0
        ? title
        : list.length === 1
          ? `Documento jurídico: ${repairMojibakeUtf8Filename(list[0].originalname || 'contrato')}`
          : `Documentos jurídicos (${list.length} arquivos)`;
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
      workId,
      kind: WorkTimelineKind.Legal,
      body,
      authorUserId: userId,
      authorDisplayName,
      createdAt: recordedAt,
    });
    await this.entryRepo.save(entry);
    entry.attachments = await this.saveEntryAttachments(
      condominiumId,
      workId,
      entry.id,
      list,
    );
    await this.touchWork(workId);
    return await this.mapEntry(condominiumId, entry, null);
  }

  async addBudget(
    condominiumId: string,
    workId: string,
    userId: string,
    dto: CreateWorkBudgetDto,
    files: Express.Multer.File[] = [],
  ): Promise<WorkTimelineEntryDto> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);
    const authorDisplayName = await this.resolveDisplayName(userId);
    const list = files.filter((f) => f?.buffer?.length);
    const recordedAt = resolveTimelineRecordedAt(
      resolveRecordedOnWithFilenameFallback(
        dto.recordedOn,
        list.map((f) =>
          encodeUploadOriginalFilename(f.originalname || 'anexo'),
        ),
      ),
    );
    const supplierFields = await this.resolveBudgetSupplierFields(
      condominiumId,
      userId,
      dto,
      true,
    );
    const status = dto.status ?? WorkBudgetStatus.AwaitingBudget;
    if (status === WorkBudgetStatus.AwaitingBudget && list.length > 0) {
      throw new BadRequestException(
        'Anexe o orçamento na linha do tempo depois da visita do fornecedor.',
      );
    }
    const budget = this.budgetRepo.create({
      id: randomUUID(),
      workId,
      supplierId: supplierFields.supplierId,
      supplierName: supplierFields.supplierName,
      title: (dto.title ?? '').trim() || null,
      amountCents: dto.amountCents ?? 0,
      validUntil: dto.validUntil ?? null,
      scheduledAt: resolveBudgetScheduledAt(dto.scheduledAt),
      status,
      notes: (dto.notes ?? '').trim() || null,
      createdByUserId: userId,
      createdAt: recordedAt,
    });
    await this.budgetRepo.save(budget);
    const summary = formatBudgetTimelineSummary(
      budget.supplierName,
      budget.amountCents,
      budget.status,
      (cents) => this.formatCents(cents),
      budget.title,
    );
    const entry = this.entryRepo.create({
      id: randomUUID(),
      workId,
      kind: WorkTimelineKind.Budget,
      body: summary,
      budgetId: budget.id,
      authorUserId: userId,
      authorDisplayName,
      createdAt: recordedAt,
    });
    await this.entryRepo.save(entry);
    entry.attachments = await this.saveEntryAttachments(
      condominiumId,
      workId,
      entry.id,
      list,
    );
    await this.touchWork(workId);
    return await this.mapEntry(condominiumId, entry, budget);
  }

  async addTimelineEntryAttachments(
    condominiumId: string,
    workId: string,
    entryId: string,
    userId: string,
    files: Express.Multer.File[],
  ): Promise<WorkTimelineEntryDto> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);
    const entry = await this.entryRepo.findOne({
      where: { id: entryId, workId },
      relations: { attachments: true, budget: true },
    });
    if (!entry) {
      throw new NotFoundException('Registro não encontrado.');
    }
    if (
      entry.kind !== WorkTimelineKind.Note &&
      entry.kind !== WorkTimelineKind.Budget &&
      entry.kind !== WorkTimelineKind.Legal
    ) {
      throw new BadRequestException(
        'Só é possível anexar arquivos a comentários, registros jurídicos ou orçamentos.',
      );
    }
    const added = await this.saveEntryAttachments(
      condominiumId,
      workId,
      entry.id,
      files,
    );
    entry.attachments = [...(entry.attachments ?? []), ...added];
    await this.touchWork(workId);
    return await this.mapEntry(condominiumId, entry, entry.budget ?? null);
  }

  async removeTimelineAttachment(
    condominiumId: string,
    workId: string,
    entryId: string,
    attachmentId: string,
    userId: string,
  ): Promise<WorkTimelineEntryDto> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);
    const entry = await this.entryRepo.findOne({
      where: { id: entryId, workId },
      relations: { attachments: true, budget: true },
    });
    if (!entry) {
      throw new NotFoundException('Registro não encontrado.');
    }
    if (
      entry.kind !== WorkTimelineKind.Note &&
      entry.kind !== WorkTimelineKind.Budget &&
      entry.kind !== WorkTimelineKind.Legal
    ) {
      throw new BadRequestException(
        'Só é possível remover anexos de comentários, registros jurídicos ou orçamentos.',
      );
    }
    const att = await this.timelineAttachmentRepo.findOne({
      where: { id: attachmentId, entryId },
    });
    if (!att) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    const remaining = (entry.attachments ?? []).filter(
      (a) => a.id !== attachmentId,
    ).length;
    if (entry.kind === WorkTimelineKind.Legal && remaining < 1) {
      throw new BadRequestException(
        'O registro jurídico precisa de ao menos um documento anexado.',
      );
    }
    if (entry.kind === WorkTimelineKind.Note) {
      const hasBody = (entry.body ?? '').trim().length > 0;
      if (!hasBody && remaining < 1) {
        throw new BadRequestException(
          'O comentário precisa de texto ou ao menos um anexo.',
        );
      }
    }
    await this.workStorage.deleteWorkDocument(condominiumId, att.storageKey);
    await this.timelineAttachmentRepo.delete({ id: att.id });
    const reloaded = await this.entryRepo.findOne({
      where: { id: entryId, workId },
      relations: { attachments: true, budget: true },
    });
    if (!reloaded) {
      throw new NotFoundException('Registro não encontrado.');
    }
    await this.touchWork(workId);
    return await this.mapEntry(
      condominiumId,
      reloaded,
      reloaded.budget ?? null,
    );
  }

  async replaceTimelineAttachment(
    condominiumId: string,
    workId: string,
    entryId: string,
    attachmentId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<WorkTimelineEntryDto> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);
    const entry = await this.entryRepo.findOne({
      where: { id: entryId, workId },
      relations: { attachments: true, budget: true },
    });
    if (!entry) {
      throw new NotFoundException('Registro não encontrado.');
    }
    if (
      entry.kind !== WorkTimelineKind.Note &&
      entry.kind !== WorkTimelineKind.Budget &&
      entry.kind !== WorkTimelineKind.Legal
    ) {
      throw new BadRequestException(
        'Só é possível substituir anexos de comentários, registros jurídicos ou orçamentos.',
      );
    }
    const att = await this.timelineAttachmentRepo.findOne({
      where: { id: attachmentId, entryId },
    });
    if (!att) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo.');
    }
    if (usesLocalDiskOnly(this.config)) {
      const db = this.config.get<string>('DATABASE_URL') ?? '';
      const likelyRemoteDb =
        /@[^/]+:\d+\//.test(db) &&
        !/localhost|127\.0\.0\.1/i.test(db);
      if (likelyRemoteDb) {
        throw new BadRequestException(
          'Anexos de obras não podem ser gravados só no disco desta máquina enquanto a API usa base de dados remota. No .env da API, configure STORAGE_DRIVER=nextcloud (NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_APP_PASSWORD) ou STORAGE_API_* para o mesmo storage usado em produção.',
        );
      }
    }

    const previousStorageKey = att.storageKey;
    const originalFilename = encodeUploadOriginalFilename(
      file.originalname || 'anexo',
    ).slice(0, 255);
    const storageKey = await this.workStorage.saveWorkDocument(
      condominiumId,
      workId,
      file.buffer,
      file.mimetype || 'application/octet-stream',
      originalFilename,
    );

    att.storageKey = storageKey;
    att.originalFilename = originalFilename;
    att.mimeType = file.mimetype;
    att.sizeBytes = file.size;
    await this.timelineAttachmentRepo.save(att);

    try {
      await this.workStorage.deleteWorkDocument(
        condominiumId,
        previousStorageKey,
      );
    } catch {
      /* blob antigo pode já não existir (link quebrado) */
    }

    const reloaded = await this.entryRepo.findOne({
      where: { id: entryId, workId },
      relations: { attachments: true, budget: true },
    });
    if (!reloaded) {
      throw new NotFoundException('Registro não encontrado.');
    }
    await this.touchWork(workId);
    return await this.mapEntry(
      condominiumId,
      reloaded,
      reloaded.budget ?? null,
    );
  }

  async updateBudget(
    condominiumId: string,
    workId: string,
    budgetId: string,
    userId: string,
    dto: UpdateWorkBudgetDto,
  ): Promise<WorkBudgetDto> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);
    const budget = await this.budgetRepo.findOne({
      where: { id: budgetId, workId },
    });
    if (!budget) {
      throw new NotFoundException('Orçamento não encontrado.');
    }
    const previous = {
      supplierName: budget.supplierName,
      title: budget.title,
      amountCents: budget.amountCents,
      validUntil: budget.validUntil,
      scheduledAt: budget.scheduledAt,
      status: budget.status,
      notes: budget.notes,
    };
    const auditBody = buildBudgetUpdateAuditBody({
      supplierName: budget.supplierName,
      previous,
      next: {
        supplierName:
          dto.supplierName !== undefined ? dto.supplierName.trim() : undefined,
        title:
          dto.title !== undefined ? (dto.title ?? '').trim() || null : undefined,
        amountCents: dto.amountCents,
        validUntil: dto.validUntil,
        scheduledAt:
          dto.scheduledAt !== undefined
            ? resolveBudgetScheduledAt(dto.scheduledAt ?? undefined)
            : undefined,
        status: dto.status,
        notes:
          dto.notes !== undefined
            ? (dto.notes ?? '').trim() || null
            : undefined,
      },
      formatCents: (cents) => this.formatCents(cents),
    });
    await this.applyBudgetSupplierPatch(condominiumId, userId, budget, dto);
    if (dto.amountCents !== undefined) {
      budget.amountCents = dto.amountCents;
    }
    if (dto.validUntil !== undefined) {
      budget.validUntil = dto.validUntil;
    }
    if (dto.scheduledAt !== undefined) {
      budget.scheduledAt = resolveBudgetScheduledAt(dto.scheduledAt ?? undefined);
    }
    if (dto.title !== undefined) {
      budget.title = (dto.title ?? '').trim() || null;
    }
    if (dto.status !== undefined) {
      const nextStatus = dto.status;
      if (
        nextStatus === WorkBudgetStatus.UnderReview &&
        budget.status === WorkBudgetStatus.AwaitingBudget
      ) {
        const cents = dto.amountCents ?? budget.amountCents;
        if (cents <= 0) {
          throw new BadRequestException(
            'Informe o valor do orçamento recebido.',
          );
        }
      }
      budget.status = nextStatus;
    }
    if (dto.notes !== undefined) {
      budget.notes = (dto.notes ?? '').trim() || null;
    }
    await this.budgetRepo.save(budget);
    await this.syncBudgetTimelineEntryBody(workId, budget);
    if (auditBody) {
      await this.recordEditTimelineEntry(workId, userId, auditBody);
    } else {
      await this.touchWork(workId);
    }
    return this.mapBudget(budget);
  }

  async readTimelineAttachmentFile(
    condominiumId: string,
    workId: string,
    entryId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);
    if (attachmentId === entryId) {
      const legacy = await this.entryRepo.findOne({
        where: { id: entryId, workId, kind: WorkTimelineKind.Document },
      });
      if (legacy?.storageKey) {
        return this.readTimelineFile(
          condominiumId,
          workId,
          entryId,
          userId,
        );
      }
    }
    const att = await this.timelineAttachmentRepo.findOne({
      where: { id: attachmentId, entryId },
      relations: { entry: true },
    });
    if (!att || att.entry.workId !== workId) {
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
  async readTimelineFile(
    condominiumId: string,
    workId: string,
    entryId: string,
    userId: string,
  ) {
    await this.governance.assertAnyAccess(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);
    const entry = await this.entryRepo.findOne({
      where: { id: entryId, workId, kind: WorkTimelineKind.Document },
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

  async updateTimelineEntry(
    condominiumId: string,
    workId: string,
    entryId: string,
    userId: string,
    dto: UpdateTimelineEntryDto,
  ): Promise<WorkTimelineEntryDto> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);

    const hasBody = dto.body !== undefined;
    const hasRecordedOn =
      dto.recordedOn !== undefined && dto.recordedOn.trim().length > 0;
    const hasBudgetFields =
      dto.amountCents !== undefined ||
      dto.supplierId !== undefined ||
      dto.supplierName !== undefined ||
      dto.scheduledAt !== undefined ||
      dto.status !== undefined ||
      dto.title !== undefined;
    if (!hasBody && !hasRecordedOn && !hasBudgetFields) {
      throw new BadRequestException(
        'Informe ao menos um campo para atualizar.',
      );
    }

    const entry = await this.entryRepo.findOne({
      where: { id: entryId, workId },
      relations: { attachments: true, budget: true },
    });
    if (!entry) {
      throw new NotFoundException('Registro não encontrado.');
    }
    if (
      entry.kind !== WorkTimelineKind.Note &&
      entry.kind !== WorkTimelineKind.Legal &&
      entry.kind !== WorkTimelineKind.Budget
    ) {
      throw new BadRequestException(
        'Só é possível editar comentários, registros jurídicos ou orçamentos.',
      );
    }

    if (hasBody && entry.kind === WorkTimelineKind.Budget) {
      throw new BadRequestException(
        'O texto do card de orçamento é gerado automaticamente; altere fornecedor ou valor.',
      );
    }

    if (hasBudgetFields) {
      if (entry.kind !== WorkTimelineKind.Budget || !entry.budget) {
        throw new BadRequestException(
          'Só é possível alterar valor e fornecedor em orçamentos.',
        );
      }
    }

    const previousBody = entry.body;
    const previousCreatedAt = new Date(entry.createdAt);

    let nextBody: string | null | undefined;
    if (hasBody) {
      nextBody = (dto.body ?? '').trim() || null;
      if (entry.kind === WorkTimelineKind.Note) {
        const attachmentCount = entry.attachments?.length ?? 0;
        if (!nextBody && attachmentCount < 1) {
          throw new BadRequestException(
            'O comentário precisa de texto ou ao menos um anexo.',
          );
        }
      }
      entry.body = nextBody;
    }

    let nextCreatedAt: Date | undefined;
    if (hasRecordedOn) {
      nextCreatedAt = resolveTimelineRecordedAt(dto.recordedOn!.trim());
      entry.createdAt = nextCreatedAt;
      if (entry.kind === WorkTimelineKind.Budget && entry.budget) {
        entry.budget.createdAt = nextCreatedAt;
        await this.budgetRepo.save(entry.budget);
      }
    }

    let budgetAuditBody: string | null = null;
    if (hasBudgetFields && entry.budget) {
      const budget = entry.budget;
      const previousBudget = {
        supplierName: budget.supplierName,
        title: budget.title,
        amountCents: budget.amountCents,
        validUntil: budget.validUntil,
        scheduledAt: budget.scheduledAt,
        status: budget.status,
        notes: budget.notes,
      };
      budgetAuditBody = buildBudgetUpdateAuditBody({
        supplierName: budget.supplierName,
        previous: previousBudget,
        next: {
          supplierName:
            dto.supplierName !== undefined
              ? dto.supplierName.trim()
              : undefined,
          amountCents: dto.amountCents,
          scheduledAt:
            dto.scheduledAt !== undefined
              ? resolveBudgetScheduledAt(dto.scheduledAt ?? undefined)
              : undefined,
          status: dto.status,
          title:
            dto.title !== undefined
              ? (dto.title ?? '').trim() || null
              : undefined,
        },
        formatCents: (cents) => this.formatCents(cents),
      });
      if (dto.supplierId !== undefined || dto.supplierName !== undefined) {
        await this.applyBudgetSupplierPatch(condominiumId, userId, budget, {
          supplierId: dto.supplierId,
          supplierName: dto.supplierName,
        });
      }
      if (dto.amountCents !== undefined) {
        budget.amountCents = dto.amountCents;
      }
      if (dto.scheduledAt !== undefined) {
        budget.scheduledAt = resolveBudgetScheduledAt(dto.scheduledAt ?? undefined);
      }
      if (dto.status !== undefined) {
        const nextStatus = dto.status;
        if (
          nextStatus === WorkBudgetStatus.UnderReview &&
          budget.status === WorkBudgetStatus.AwaitingBudget
        ) {
          const cents = dto.amountCents ?? budget.amountCents;
          if (cents <= 0) {
            throw new BadRequestException(
              'Informe o valor do orçamento recebido.',
            );
          }
        }
        budget.status = nextStatus;
      }
      if (dto.title !== undefined) {
        budget.title = (dto.title ?? '').trim() || null;
      }
      await this.budgetRepo.save(budget);
      entry.body = formatBudgetTimelineSummary(
        budget.supplierName,
        budget.amountCents,
        budget.status,
        (cents) => this.formatCents(cents),
        budget.title,
      );
    }

    const timelineAuditBody = buildTimelineEntryUpdateAuditBody({
      kind: entry.kind,
      previousBody,
      previousCreatedAt,
      nextBody: hasBody ? nextBody! : undefined,
      nextCreatedAt,
    });

    await this.entryRepo.save(entry);

    if (budgetAuditBody) {
      await this.recordEditTimelineEntry(workId, userId, budgetAuditBody);
    }
    if (timelineAuditBody) {
      await this.recordEditTimelineEntry(workId, userId, timelineAuditBody);
    }
    if (!budgetAuditBody && !timelineAuditBody) {
      await this.touchWork(workId);
    }

    return await this.mapEntry(
      condominiumId,
      entry,
      entry.budget ?? null,
    );
  }

  async removeTimelineEntry(
    condominiumId: string,
    workId: string,
    entryId: string,
    userId: string,
  ): Promise<void> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findWorkOrThrow(condominiumId, workId);
    const entry = await this.entryRepo.findOne({
      where: { id: entryId, workId },
    });
    if (!entry) {
      throw new NotFoundException('Registro não encontrado.');
    }
    if (entry.kind === WorkTimelineKind.Transaction) {
      throw new BadRequestException(
        'Lançamentos financeiros são removidos da timeline ao desvincular a obra em Transações.',
      );
    }
    if (
      entry.kind !== WorkTimelineKind.Note &&
      entry.kind !== WorkTimelineKind.Budget &&
      entry.kind !== WorkTimelineKind.Legal
    ) {
      throw new BadRequestException(
        'Só é possível remover comentários, jurídico ou orçamentos da timeline.',
      );
    }
    if (entry.kind === WorkTimelineKind.Budget && entry.budgetId) {
      await this.budgetRepo.delete({ id: entry.budgetId });
    }
    await this.entryRepo.delete({ id: entry.id });
    await this.touchWork(workId);
  }

  private async findWorkOrThrow(
    condominiumId: string,
    workId: string,
  ): Promise<CondominiumWork> {
    const work = await this.workRepo.findOne({
      where: { id: workId, condominiumId },
    });
    if (!work) {
      throw new NotFoundException('Obra não encontrada.');
    }
    return work;
  }

  private async touchWork(workId: string): Promise<void> {
    await this.workRepo.update({ id: workId }, { updatedAt: new Date() });
  }

  private async syncBudgetTimelineEntryBody(
    workId: string,
    budget: CondominiumWorkBudget,
  ): Promise<void> {
    const entry = await this.entryRepo.findOne({
      where: { workId, budgetId: budget.id, kind: WorkTimelineKind.Budget },
    });
    if (!entry) {
      return;
    }
    const summary = formatBudgetTimelineSummary(
      budget.supplierName,
      budget.amountCents,
      budget.status,
      (cents) => this.formatCents(cents),
      budget.title,
    );
    if (entry.body !== summary) {
      entry.body = summary;
      await this.entryRepo.save(entry);
    }
  }

  private async recordEditTimelineEntry(
    workId: string,
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
      workId,
      kind: WorkTimelineKind.Edit,
      body: trimmed,
      authorUserId: userId,
      authorDisplayName,
    });
    await this.entryRepo.save(entry);
    await this.touchWork(workId);
  }

  private async loadTimeline(
    condominiumId: string,
    workId: string,
    includeFileUrls = false,
  ): Promise<WorkTimelineEntryDto[]> {
    const entries = await this.entryRepo.find({
      where: { workId },
      relations: {
        attachments: true,
        budget: true,
        financialTransaction: true,
      },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      entries.map((e) =>
        this.mapEntry(condominiumId, e, e.budget ?? null, includeFileUrls),
      ),
    );
  }

  private async loadCostsSummary(
    condominiumId: string,
    workId: string,
  ): Promise<WorkCostsSummaryDto> {
    const todayYmd = formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon());
    const [expenseRaw, approvedRaw, budgetCount, approvedList] = await Promise.all([
      this.financialTxRepo
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
        .andWhere('t.work_id = :workId', { workId })
        .andWhere('t.kind = :kind', { kind: 'expense' })
        .andWhere('t.payment_status != :cancelled', {
          cancelled: 'cancelled',
        })
        .setParameter('todayYmd', todayYmd)
        .getRawOne<{
          paidTotal: string | number | null;
          paidCount: string | number | null;
          overdueTotal: string | number | null;
          overdueCount: string | number | null;
          futureTotal: string | number | null;
          futureCount: string | number | null;
        }>(),
      this.budgetRepo
        .createQueryBuilder('b')
        .select('COALESCE(SUM(b.amount_cents), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('b.work_id = :workId', { workId })
        .andWhere('b.status = :approved', {
          approved: WorkBudgetStatus.Approved,
        })
        .getRawOne<{ total: string | number | null; count: string | number }>(),
      this.budgetRepo.count({ where: { workId } }),
      this.budgetRepo.find({
        where: { workId, status: WorkBudgetStatus.Approved },
        select: ['supplierName'],
        order: { supplierName: 'ASC' },
      }),
    ]);

    const paidCents = Number(expenseRaw?.paidTotal ?? 0);
    const paidCount = Number(expenseRaw?.paidCount ?? 0);
    const overdueCents = Number(expenseRaw?.overdueTotal ?? 0);
    const overdueCount = Number(expenseRaw?.overdueCount ?? 0);
    const futureCents = Number(expenseRaw?.futureTotal ?? 0);
    const futureCount = Number(expenseRaw?.futureCount ?? 0);
    const forecastCents = paidCents + overdueCents + futureCents;
    const expenseCount = paidCount + overdueCount + futureCount;
    const approvedCount = Number(approvedRaw?.count ?? 0);
    const approvedCentsTotal = Number(approvedRaw?.total ?? 0);
    let progressPercent: number | null = null;
    if (approvedCount > 0 && approvedCentsTotal > 0) {
      progressPercent = Math.round((forecastCents / approvedCentsTotal) * 100);
    }

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
      approvedBudgetCents:
        approvedCount > 0 ? String(approvedCentsTotal) : null,
      approvedBudgetCount: Number.isFinite(approvedCount) ? approvedCount : 0,
      approvedBudgetSuppliers: this.formatApprovedBudgetSuppliers(approvedList),
      budgetCount,
      progressPercent,
    };
  }

  private formatApprovedBudgetSuppliers(
    budgets: Pick<CondominiumWorkBudget, 'supplierName'>[],
  ): string | null {
    const names = [
      ...new Set(
        budgets.map((b) => b.supplierName.trim()).filter((n) => n.length > 0),
      ),
    ];
    if (names.length === 0) {
      return null;
    }
    if (names.length === 1) {
      return names[0];
    }
    if (names.length === 2) {
      return `${names[0]} e ${names[1]}`;
    }
    return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  }

  private async nextQueueOrder(condominiumId: string): Promise<number> {
    const row = await this.workRepo
      .createQueryBuilder('w')
      .select('MAX(w.queueOrder)', 'm')
      .where('w.condominiumId = :condominiumId', { condominiumId })
      .andWhere('w.status IN (:...statuses)', {
        statuses: [WorkStatus.Planned, WorkStatus.InProgress],
      })
      .getRawOne<{ m: string | number | null }>();
    const max = Number(row?.m);
    return (Number.isFinite(max) ? max : -1) + 1;
  }

  private toListItem(
    w: CondominiumWork,
    lastActivityAt: Date | null,
  ): WorkListItemDto {
    return {
      id: w.id,
      condominiumId: w.condominiumId,
      title: w.title,
      description: w.description,
      status: w.status,
      queueOrder: w.queueOrder ?? 0,
      allocationRule: getWorkAllocationRule(w),
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
      lastActivityAt: lastActivityAt?.toISOString() ?? null,
    };
  }

  private async saveEntryAttachments(
    condominiumId: string,
    workId: string,
    entryId: string,
    files: Express.Multer.File[],
  ): Promise<CondominiumWorkTimelineAttachment[]> {
    const list = files.filter((f) => f?.buffer?.length);
    if (list.length > 0 && usesLocalDiskOnly(this.config)) {
      const db = this.config.get<string>('DATABASE_URL') ?? '';
      const likelyRemoteDb =
        /@[^/]+:\d+\//.test(db) &&
        !/localhost|127\.0\.0\.1/i.test(db);
      if (likelyRemoteDb) {
        throw new BadRequestException(
          'Anexos de obras não podem ser gravados só no disco desta máquina enquanto a API usa base de dados remota. No .env da API, configure STORAGE_DRIVER=nextcloud (NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_APP_PASSWORD) ou STORAGE_API_* para o mesmo storage usado em produção.',
        );
      }
    }
    const saved: CondominiumWorkTimelineAttachment[] = [];
    for (const file of list) {
      const originalFilename = encodeUploadOriginalFilename(
        file.originalname || 'anexo',
      ).slice(0, 255);
      const storageKey = await this.workStorage.saveWorkDocument(
        condominiumId,
        workId,
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

  private async resolveBudgetSupplierFields(
    condominiumId: string,
    userId: string,
    input: Pick<CreateWorkBudgetDto, 'supplierId' | 'supplierName'>,
    required: boolean,
  ): Promise<{ supplierId: string | null; supplierName: string }> {
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
    throw new BadRequestException('Informe o fornecedor.');
  }

  private async applyBudgetSupplierPatch(
    condominiumId: string,
    userId: string,
    budget: CondominiumWorkBudget,
    dto: Pick<UpdateWorkBudgetDto, 'supplierId' | 'supplierName'>,
  ): Promise<void> {
    if (dto.supplierId !== undefined) {
      if (dto.supplierId === null) {
        if (dto.supplierName !== undefined) {
          const supplier = await this.suppliers.ensureByName(
            condominiumId,
            userId,
            dto.supplierName,
          );
          budget.supplierId = supplier.id;
          budget.supplierName = supplier.name;
        } else {
          budget.supplierId = null;
        }
        return;
      }
      const resolved = await this.resolveBudgetSupplierFields(
        condominiumId,
        userId,
        { supplierId: dto.supplierId },
        true,
      );
      budget.supplierId = resolved.supplierId;
      budget.supplierName = resolved.supplierName;
      return;
    }
    if (dto.supplierName !== undefined) {
      const supplier = await this.suppliers.ensureByName(
        condominiumId,
        userId,
        dto.supplierName,
      );
      budget.supplierId = supplier.id;
      budget.supplierName = supplier.name;
    }
  }

  private mapBudget(b: CondominiumWorkBudget): WorkBudgetDto {
    return {
      id: b.id,
      supplierId: b.supplierId,
      supplierName: b.supplierName,
      title: b.title,
      amountCents: b.amountCents,
      validUntil: b.validUntil,
      scheduledAt: b.scheduledAt?.toISOString() ?? null,
      status: b.status,
      notes: b.notes,
      createdAt: b.createdAt.toISOString(),
    };
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
    e: CondominiumWorkTimelineEntry,
    includeFileUrls: boolean,
  ): Promise<WorkTimelineAttachmentDto[]> {
    const list: WorkTimelineAttachmentDto[] = (e.attachments ?? []).map((a) => ({
      id: a.id,
      originalFilename: repairMojibakeUtf8Filename(a.originalFilename),
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      fileUrl: null as string | null,
    }));
    if (
      e.kind === WorkTimelineKind.Document &&
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
          row.id === e.id && e.kind === WorkTimelineKind.Document
            ? e.storageKey
            : (e.attachments ?? []).find((a) => a.id === row.id)?.storageKey;
        row.fileUrl = await this.resolveAttachmentFileUrl(
          condominiumId,
          key,
        );
      }),
    );
    return list;
  }

  private mapTransactionEntry(
    e: CondominiumWorkTimelineEntry,
  ): WorkTimelineTransactionDto | null {
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
    e: CondominiumWorkTimelineEntry,
    budget: CondominiumWorkBudget | null,
    includeFileUrls = false,
  ): Promise<WorkTimelineEntryDto> {
    return {
      id: e.id,
      kind: e.kind,
      body: e.body,
      budget: budget ? this.mapBudget(budget) : null,
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
        e.kind === WorkTimelineKind.Transaction
          ? this.mapTransactionEntry(e)
          : null,
    };
  }

  private formatCents(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
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
