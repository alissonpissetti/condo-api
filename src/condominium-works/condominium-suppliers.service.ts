import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GovernanceService } from '../planning/governance.service';
import { CondominiumSupplierCategoriesService } from './condominium-supplier-categories.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { CondominiumSupplier } from './entities/condominium-supplier.entity';
import { CondominiumWorkBudget } from './entities/condominium-work-budget.entity';
import { SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID } from './supplier-category.constants';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { SuppliersService } from '../suppliers/suppliers.service';

export type SupplierView = {
  id: string;
  condominiumId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  pixKey: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIsGlobal: boolean | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class CondominiumSuppliersService {
  constructor(
    @InjectRepository(CondominiumSupplier)
    private readonly supplierRepo: Repository<CondominiumSupplier>,
    @InjectRepository(CondominiumWorkBudget)
    private readonly budgetRepo: Repository<CondominiumWorkBudget>,
    @InjectRepository(Supplier)
    private readonly catalogSupplierRepo: Repository<Supplier>,
    private readonly governance: GovernanceService,
    private readonly categories: CondominiumSupplierCategoriesService,
    private readonly catalogSuppliers: SuppliersService,
  ) {}

  async findAll(
    condominiumId: string,
    userId: string,
  ): Promise<SupplierView[]> {
    await this.governance.assertManagement(condominiumId, userId);
    const rows = await this.supplierRepo.find({
      where: { condominiumId },
      relations: { category: true },
      order: { name: 'ASC', createdAt: 'ASC' },
    });
    return Promise.all(rows.map((r) => this.map(r)));
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateSupplierDto,
  ): Promise<SupplierView> {
    await this.governance.assertManagement(condominiumId, userId);
    const categoryId = await this.resolveCategoryInput(condominiumId, dto);
    const row = this.supplierRepo.create({
      condominiumId,
      name: dto.name.trim(),
      contactName: this.normalizeOptional(dto.contactName),
      phone: this.normalizeOptional(dto.phone),
      pixKey: this.normalizeOptional(dto.pixKey),
      categoryId,
    });
    const saved = await this.supplierRepo.save(row);
    const withCategory = await this.supplierRepo.findOne({
      where: { id: saved.id },
      relations: { category: true },
    });
    return this.map(withCategory ?? saved);
  }

  async update(
    condominiumId: string,
    supplierId: string,
    userId: string,
    dto: UpdateSupplierDto,
  ): Promise<SupplierView> {
    await this.governance.assertManagement(condominiumId, userId);
    const row = await this.findOneInCondominium(condominiumId, supplierId);
    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }
    if (dto.contactName !== undefined) {
      row.contactName = this.normalizeOptional(dto.contactName);
    }
    if (dto.phone !== undefined) {
      row.phone = this.normalizeOptional(dto.phone);
    }
    if (dto.pixKey !== undefined) {
      row.pixKey = this.normalizeOptional(dto.pixKey);
    }
    if (dto.categoryId !== undefined || dto.newCategoryName !== undefined) {
      row.categoryId = await this.resolveCategoryInput(condominiumId, dto);
    }
    const saved = await this.supplierRepo.save(row);
    const withCategory = await this.supplierRepo.findOne({
      where: { id: saved.id },
      relations: { category: true },
    });
    return this.map(withCategory ?? saved);
  }

  async remove(
    condominiumId: string,
    supplierId: string,
    userId: string,
  ): Promise<void> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findOneInCondominium(condominiumId, supplierId);
    const linked = await this.budgetRepo.count({
      where: { supplierId },
    });
    if (linked > 0) {
      throw new BadRequestException(
        'Fornecedor vinculado a orçamentos de obra; não é possível excluir.',
      );
    }
    await this.supplierRepo.delete({ id: supplierId, condominiumId });
  }

  /**
   * Garante um fornecedor cadastrado pelo nome (cria só com o nome se não existir).
   * Comparação sem diferenciar maiúsculas no mesmo condomínio.
   */
  async ensureByName(
    condominiumId: string,
    userId: string,
    rawName: string,
  ): Promise<CondominiumSupplier> {
    await this.governance.assertManagement(condominiumId, userId);
    const name = rawName.trim();
    if (!name) {
      throw new BadRequestException('Nome do fornecedor inválido.');
    }
    await this.catalogSuppliers.ensureByName(condominiumId, userId, name);
    const existing = await this.supplierRepo
      .createQueryBuilder('s')
      .where('s.condominium_id = :condominiumId', { condominiumId })
      .andWhere('LOWER(s.name) = LOWER(:name)', { name })
      .getOne();
    if (existing) {
      return existing;
    }
    const row = this.supplierRepo.create({
      condominiumId,
      name,
      contactName: null,
      phone: null,
      pixKey: null,
      categoryId: null,
    });
    return this.supplierRepo.save(row);
  }

  async findOneInCondominium(
    condominiumId: string,
    supplierId: string,
  ): Promise<CondominiumSupplier> {
    const row = await this.supplierRepo.findOne({
      where: { id: supplierId, condominiumId },
    });
    if (!row) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }
    return row;
  }

  /**
   * Resolve o fornecedor de um orçamento: aceita ID do cadastro de obras
   * (`condominium_suppliers`) ou do catálogo geral (`suppliers`).
   */
  async resolveForBudgetLink(
    condominiumId: string,
    userId: string,
    supplierId: string,
  ): Promise<CondominiumSupplier> {
    const trimmedId = supplierId.trim();
    if (!trimmedId) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }
    const obraSupplier = await this.supplierRepo.findOne({
      where: { id: trimmedId, condominiumId },
    });
    if (obraSupplier) {
      return obraSupplier;
    }
    const catalogSupplier = await this.catalogSupplierRepo.findOne({
      where: { id: trimmedId, condominiumId },
    });
    if (!catalogSupplier) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }
    return this.ensureByName(condominiumId, userId, catalogSupplier.name);
  }

  private async resolveCategoryInput(
    condominiumId: string,
    dto: Pick<CreateSupplierDto, 'categoryId' | 'newCategoryName'>,
  ): Promise<string | null> {
    const newName = (dto.newCategoryName ?? '').trim();
    const categoryId =
      dto.categoryId === undefined || dto.categoryId === null
        ? ''
        : String(dto.categoryId).trim();
    if (newName && categoryId) {
      throw new BadRequestException(
        'Informe uma categoria existente ou um nome para nova categoria, não ambos.',
      );
    }
    return this.categories.resolveCategoryIdForSupplier(condominiumId, {
      categoryId: categoryId || null,
      newCategoryName: newName || null,
    });
  }

  private normalizeOptional(value: string | null | undefined): string | null {
    const v = (value ?? '').trim();
    return v || null;
  }

  private async map(row: CondominiumSupplier): Promise<SupplierView> {
    let categoryName: string | null = null;
    let categoryIsGlobal: boolean | null = null;
    if (row.category) {
      categoryName = row.category.name;
      categoryIsGlobal =
        row.category.condominiumId === SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID;
    } else if (row.categoryId) {
      const category = await this.categories.findCategoryView(row.categoryId);
      categoryName = category?.name ?? null;
      categoryIsGlobal = category?.isGlobal ?? null;
    }
    return {
      id: row.id,
      condominiumId: row.condominiumId,
      name: row.name,
      contactName: row.contactName,
      phone: row.phone,
      pixKey: row.pixKey,
      categoryId: row.categoryId,
      categoryName,
      categoryIsGlobal,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
