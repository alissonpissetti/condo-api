import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { parseDateOnlyFromApi } from '../finance/date-only.util';
import { GovernanceService } from '../planning/governance.service';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { CreateConstructionProjectDto } from './dto/create-construction-project.dto';
import { CreateProjectUpdateDto } from './dto/create-project-update.dto';
import { UpdateConstructionProjectDto } from './dto/update-construction-project.dto';
import { UpdateProjectUpdateDto } from './dto/update-project-update.dto';
import { ConstructionProjectUpdate } from './entities/construction-project-update.entity';
import { ConstructionProject } from './entities/construction-project.entity';

@Injectable()
export class ConstructionWorksService {
  constructor(
    @InjectRepository(ConstructionProject)
    private readonly projectRepo: Repository<ConstructionProject>,
    @InjectRepository(ConstructionProjectUpdate)
    private readonly updateRepo: Repository<ConstructionProjectUpdate>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    private readonly condominiumsService: CondominiumsService,
    private readonly governance: GovernanceService,
    @Inject(RECEIPT_STORAGE) private readonly storage: ReceiptStoragePort,
  ) {}

  async listProjects(
    condominiumId: string,
    userId: string,
  ): Promise<ConstructionProject[]> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    return this.projectRepo.find({
      where: { condominiumId },
      relations: { supplier: true },
      order: { updatedAt: 'DESC' },
    });
  }

  async getProject(
    condominiumId: string,
    projectId: string,
    userId: string,
  ): Promise<ConstructionProject> {
    await this.governance.assertAnyAccess(condominiumId, userId);
    const p = await this.projectRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.supplier', 'supplier')
      .leftJoinAndSelect('p.updates', 'u')
      .where('p.id = :id', { id: projectId })
      .andWhere('p.condominium_id = :cid', { cid: condominiumId })
      .orderBy('u.occurred_on', 'DESC')
      .addOrderBy('u.created_at', 'DESC')
      .getOne();
    if (!p) {
      throw new NotFoundException('Obra não encontrada.');
    }
    return p;
  }

  async createProject(
    condominiumId: string,
    userId: string,
    dto: CreateConstructionProjectDto,
  ): Promise<ConstructionProject> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const supplierId = await this.resolveSupplierIdForCondominium(
      condominiumId,
      dto.supplierId,
    );
    const row = this.projectRepo.create({
      condominiumId,
      title: dto.title.trim(),
      description: dto.description?.trim() ? dto.description.trim() : null,
      status: dto.status,
      startedOn: dto.startedOn ? parseDateOnlyFromApi(dto.startedOn) : null,
      expectedEndOn: dto.expectedEndOn
        ? parseDateOnlyFromApi(dto.expectedEndOn)
        : null,
      completedOn: dto.completedOn
        ? parseDateOnlyFromApi(dto.completedOn)
        : null,
      supplierId,
    });
    const saved = await this.projectRepo.save(row);
    return this.getProject(condominiumId, saved.id, userId);
  }

  async updateProject(
    condominiumId: string,
    projectId: string,
    userId: string,
    dto: UpdateConstructionProjectDto,
  ): Promise<ConstructionProject> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const existing = await this.projectRepo.findOne({
      where: { id: projectId, condominiumId },
    });
    if (!existing) {
      throw new NotFoundException('Obra não encontrada.');
    }
    if (dto.title !== undefined) {
      existing.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      existing.description =
        dto.description === null || dto.description === ''
          ? null
          : dto.description.trim();
    }
    if (dto.status !== undefined) {
      existing.status = dto.status;
    }
    if (dto.startedOn !== undefined) {
      existing.startedOn = dto.startedOn
        ? parseDateOnlyFromApi(dto.startedOn)
        : null;
    }
    if (dto.expectedEndOn !== undefined) {
      existing.expectedEndOn = dto.expectedEndOn
        ? parseDateOnlyFromApi(dto.expectedEndOn)
        : null;
    }
    if (dto.completedOn !== undefined) {
      existing.completedOn = dto.completedOn
        ? parseDateOnlyFromApi(dto.completedOn)
        : null;
    }
    if (dto.supplierId !== undefined) {
      existing.supplierId = await this.resolveSupplierIdForCondominium(
        condominiumId,
        dto.supplierId,
      );
    }
    await this.projectRepo.save(existing);
    return this.getProject(condominiumId, projectId, userId);
  }

  async removeProject(
    condominiumId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const existing = await this.projectRepo.findOne({
      where: { id: projectId, condominiumId },
      relations: { updates: true },
    });
    if (!existing) {
      throw new NotFoundException('Obra não encontrada.');
    }
    for (const u of existing.updates ?? []) {
      await this.deleteUpdateAttachmentFiles(condominiumId, u);
    }
    await this.projectRepo.delete(projectId);
  }

  async createUpdate(
    condominiumId: string,
    projectId: string,
    userId: string,
    dto: CreateProjectUpdateDto,
  ): Promise<ConstructionProjectUpdate> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    await this.assertProjectInCondominium(condominiumId, projectId);
    const keys = this.normalizeAttachmentKeys(dto.attachmentStorageKeys);
    await this.assertAttachmentKeysExist(condominiumId, keys);
    const row = this.updateRepo.create({
      projectId,
      occurredOn: parseDateOnlyFromApi(dto.occurredOn),
      body: dto.body.trim(),
      createdByUserId: userId,
      attachmentStorageKeys: keys.length ? keys : null,
    });
    return this.updateRepo.save(row);
  }

  async updateUpdate(
    condominiumId: string,
    projectId: string,
    updateId: string,
    userId: string,
    dto: UpdateProjectUpdateDto,
  ): Promise<ConstructionProjectUpdate> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const u = await this.updateRepo.findOne({
      where: { id: updateId, projectId },
      relations: { project: true },
    });
    if (!u || u.project.condominiumId !== condominiumId) {
      throw new NotFoundException('Atualização não encontrada.');
    }
    const prevKeys = this.getAttachmentKeys(u);
    if (dto.body !== undefined) {
      u.body = dto.body.trim();
    }
    if (dto.occurredOn !== undefined) {
      u.occurredOn = parseDateOnlyFromApi(dto.occurredOn);
    }
    if (dto.attachmentStorageKeys !== undefined) {
      const nextKeys =
        dto.attachmentStorageKeys === null
          ? []
          : this.normalizeAttachmentKeys(dto.attachmentStorageKeys);
      await this.assertAttachmentKeysExist(condominiumId, nextKeys);
      u.attachmentStorageKeys = nextKeys.length ? nextKeys : null;
      await this.deleteRemovedAttachmentFiles(
        condominiumId,
        prevKeys,
        nextKeys,
      );
    }
    return this.updateRepo.save(u);
  }

  async removeUpdate(
    condominiumId: string,
    projectId: string,
    updateId: string,
    userId: string,
  ): Promise<void> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const u = await this.updateRepo.findOne({
      where: { id: updateId, projectId },
      relations: { project: true },
    });
    if (!u || u.project.condominiumId !== condominiumId) {
      throw new NotFoundException('Atualização não encontrada.');
    }
    await this.deleteUpdateAttachmentFiles(condominiumId, u);
    await this.updateRepo.delete(updateId);
  }

  private async assertProjectInCondominium(
    condominiumId: string,
    projectId: string,
  ): Promise<void> {
    const n = await this.projectRepo.count({
      where: { id: projectId, condominiumId },
    });
    if (n === 0) {
      throw new NotFoundException('Obra não encontrada.');
    }
  }

  private async resolveSupplierIdForCondominium(
    condominiumId: string,
    supplierId: string | null | undefined,
  ): Promise<string | null> {
    if (supplierId === undefined) {
      return null;
    }
    if (supplierId === null) {
      return null;
    }
    const sid = String(supplierId).trim();
    if (!sid) {
      return null;
    }
    const s = await this.supplierRepo.findOne({
      where: { id: sid, condominiumId },
    });
    if (!s) {
      throw new BadRequestException(
        'Fornecedor não encontrado neste condomínio.',
      );
    }
    return sid;
  }

  private normalizeAttachmentKeys(
    keys: string[] | null | undefined,
  ): string[] {
    if (!Array.isArray(keys) || keys.length === 0) {
      return [];
    }
    return [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  }

  private getAttachmentKeys(u: ConstructionProjectUpdate): string[] {
    if (Array.isArray(u.attachmentStorageKeys) && u.attachmentStorageKeys.length) {
      return [...new Set(u.attachmentStorageKeys.map((k) => k.trim()).filter(Boolean))];
    }
    return [];
  }

  private async assertAttachmentKeysExist(
    condominiumId: string,
    keys: string[],
  ): Promise<void> {
    for (const key of keys) {
      await this.storage.assertReceiptExists(condominiumId, key);
    }
  }

  private async deleteRemovedAttachmentFiles(
    condominiumId: string,
    before: string[],
    after: string[],
  ): Promise<void> {
    for (const key of before) {
      if (!after.includes(key)) {
        await this.storage.deleteReceipt(condominiumId, key);
      }
    }
  }

  private async deleteUpdateAttachmentFiles(
    condominiumId: string,
    u: ConstructionProjectUpdate,
  ): Promise<void> {
    for (const key of this.getAttachmentKeys(u)) {
      await this.storage.deleteReceipt(condominiumId, key);
    }
  }
}
