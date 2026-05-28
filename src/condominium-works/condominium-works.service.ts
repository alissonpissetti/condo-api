import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Person } from '../people/person.entity';
import { GovernanceService } from '../planning/governance.service';
import {
  encodeUploadOriginalFilename,
  repairMojibakeUtf8Filename,
} from '../planning/upload-filename-encoding.util';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { User } from '../users/user.entity';
import { CreateTimelineNoteDto } from './dto/create-timeline-note.dto';
import { resolveTimelineRecordedAt } from './dto/parse-timeline-recorded-on';
import { resolveRecordedOnWithFilenameFallback } from './utils/filename-recorded-on.util';
import { CreateWorkBudgetDto } from './dto/create-work-budget.dto';
import { CreateWorkDto } from './dto/create-work.dto';
import { UpdateWorkBudgetDto } from './dto/update-work-budget.dto';
import { UpdateWorkDto } from './dto/update-work.dto';
import {
  assertNoteHasContent,
  parseCreateTimelineNoteBody,
} from './dto/parse-create-timeline-note-body';
import { CondominiumWorkBudget } from './entities/condominium-work-budget.entity';
import { CondominiumWorkTimelineAttachment } from './entities/condominium-work-timeline-attachment.entity';
import { CondominiumWorkTimelineEntry } from './entities/condominium-work-timeline-entry.entity';
import { CondominiumWork } from './entities/condominium-work.entity';
import { WorkBudgetStatus } from './enums/work-budget-status.enum';
import { WorkStatus } from './enums/work-status.enum';
import { WorkTimelineKind } from './enums/work-timeline-kind.enum';

export type WorkTimelineAttachmentDto = {
  id: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type WorkBudgetDto = {
  id: string;
  supplierName: string;
  amountCents: number;
  validUntil: string | null;
  status: WorkBudgetStatus;
  notes: string | null;
  createdAt: string;
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
};

export type WorkListItemDto = {
  id: string;
  condominiumId: string;
  title: string;
  description: string | null;
  status: WorkStatus;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
};

export type WorkDetailDto = WorkListItemDto & {
  timeline: WorkTimelineEntryDto[];
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
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly governance: GovernanceService,
    @Inject(RECEIPT_STORAGE)
    private readonly storage: ReceiptStoragePort,
  ) {}

  async list(condominiumId: string, userId: string): Promise<WorkListItemDto[]> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const works = await this.workRepo.find({
      where: { condominiumId },
      order: { updatedAt: 'DESC' },
    });
    const out: WorkListItemDto[] = [];
    for (const w of works) {
      const last = await this.entryRepo.findOne({
        where: { workId: w.id },
        order: { createdAt: 'DESC' },
      });
      out.push(this.toListItem(w, last?.createdAt ?? null));
    }
    return out;
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateWorkDto,
  ): Promise<WorkDetailDto> {
    await this.governance.assertManagement(condominiumId, userId);
    const work = this.workRepo.create({
      id: randomUUID(),
      condominiumId,
      title: dto.title.trim(),
      description: (dto.description ?? '').trim() || null,
      status: dto.status ?? WorkStatus.Planned,
      createdByUserId: userId,
    });
    await this.workRepo.save(work);
    return this.getOne(condominiumId, work.id, userId);
  }

  async getOne(
    condominiumId: string,
    workId: string,
    userId: string,
  ): Promise<WorkDetailDto> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const work = await this.findWorkOrThrow(condominiumId, workId);
    const timeline = await this.loadTimeline(workId);
    const lastAt = timeline[0]
      ? new Date(timeline[0].createdAt)
      : null;
    return {
      ...this.toListItem(work, lastAt),
      timeline,
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
    if (dto.title !== undefined) {
      work.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      work.description = (dto.description ?? '').trim() || null;
    }
    if (dto.status !== undefined) {
      work.status = dto.status;
    }
    await this.workRepo.save(work);
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
        await this.storage.deleteWorkDocument(condominiumId, a.storageKey);
      }
      if (e.storageKey) {
        await this.storage.deleteWorkDocument(condominiumId, e.storageKey);
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
    return this.mapEntry(entry, null);
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
    const budget = this.budgetRepo.create({
      id: randomUUID(),
      workId,
      supplierName: dto.supplierName.trim(),
      amountCents: dto.amountCents,
      validUntil: dto.validUntil ?? null,
      status: dto.status ?? WorkBudgetStatus.Received,
      notes: (dto.notes ?? '').trim() || null,
      createdByUserId: userId,
      createdAt: recordedAt,
    });
    await this.budgetRepo.save(budget);
    const summary = `Orçamento: ${budget.supplierName} — ${this.formatCents(budget.amountCents)}`;
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
    return this.mapEntry(entry, budget);
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
      entry.kind !== WorkTimelineKind.Budget
    ) {
      throw new BadRequestException(
        'Só é possível anexar arquivos a comentários ou orçamentos.',
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
    return this.mapEntry(entry, entry.budget ?? null);
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
    if (dto.supplierName !== undefined) {
      budget.supplierName = dto.supplierName.trim();
    }
    if (dto.amountCents !== undefined) {
      budget.amountCents = dto.amountCents;
    }
    if (dto.validUntil !== undefined) {
      budget.validUntil = dto.validUntil;
    }
    if (dto.status !== undefined) {
      budget.status = dto.status;
    }
    if (dto.notes !== undefined) {
      budget.notes = (dto.notes ?? '').trim() || null;
    }
    await this.budgetRepo.save(budget);
    await this.touchWork(workId);
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
    if (!this.storage.isValidWorkDocumentKey(att.storageKey)) {
      throw new BadRequestException('Chave de arquivo inválida.');
    }
    const read = await this.storage.readWorkDocument(
      condominiumId,
      att.storageKey,
    );
    const safeName = repairMojibakeUtf8Filename(
      att.originalFilename?.trim() || read.filename,
    ).replace(/"/g, '');
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
    if (!this.storage.isValidWorkDocumentKey(entry.storageKey)) {
      throw new BadRequestException('Chave de arquivo inválida.');
    }
    const read = await this.storage.readWorkDocument(
      condominiumId,
      entry.storageKey,
    );
    const safeName = repairMojibakeUtf8Filename(
      entry.originalFilename?.trim() || read.filename,
    ).replace(/"/g, '');
    return { ...read, filename: safeName };
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
    if (
      entry.kind !== WorkTimelineKind.Note &&
      entry.kind !== WorkTimelineKind.Budget
    ) {
      throw new BadRequestException(
        'Só é possível remover comentários ou orçamentos da timeline.',
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

  private async loadTimeline(workId: string): Promise<WorkTimelineEntryDto[]> {
    const entries = await this.entryRepo.find({
      where: { workId },
      relations: { attachments: true, budget: true },
      order: { createdAt: 'DESC' },
    });
    return entries.map((e) => this.mapEntry(e, e.budget ?? null));
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
    const saved: CondominiumWorkTimelineAttachment[] = [];
    const list = files.filter((f) => f?.buffer?.length);
    for (const file of list) {
      const originalFilename = encodeUploadOriginalFilename(
        file.originalname || 'anexo',
      ).slice(0, 255);
      const storageKey = await this.storage.saveWorkDocument(
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

  private mapBudget(b: CondominiumWorkBudget): WorkBudgetDto {
    return {
      id: b.id,
      supplierName: b.supplierName,
      amountCents: b.amountCents,
      validUntil: b.validUntil,
      status: b.status,
      notes: b.notes,
      createdAt: b.createdAt.toISOString(),
    };
  }

  private mapEntryAttachments(
    e: CondominiumWorkTimelineEntry,
  ): WorkTimelineAttachmentDto[] {
    const list: WorkTimelineAttachmentDto[] = (e.attachments ?? []).map(
      (a) => ({
        id: a.id,
        originalFilename: repairMojibakeUtf8Filename(a.originalFilename),
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
      }),
    );
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
      });
    }
    return list;
  }

  private mapEntry(
    e: CondominiumWorkTimelineEntry,
    budget: CondominiumWorkBudget | null,
  ): WorkTimelineEntryDto {
    return {
      id: e.id,
      kind: e.kind,
      body: e.body,
      budget: budget ? this.mapBudget(budget) : null,
      attachments: this.mapEntryAttachments(e),
      authorUserId: e.authorUserId,
      authorDisplayName: e.authorDisplayName,
      createdAt: e.createdAt.toISOString(),
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
