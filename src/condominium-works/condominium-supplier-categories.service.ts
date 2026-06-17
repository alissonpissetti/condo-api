import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GovernanceService } from '../planning/governance.service';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { UpdateSupplierCategoryDto } from './dto/update-supplier-category.dto';
import { CondominiumSupplierCategory } from './entities/condominium-supplier-category.entity';
import { CondominiumSupplier } from './entities/condominium-supplier.entity';
import { SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID } from './supplier-category.constants';
import { sortSupplierCategoriesByName } from './supplier-category-sort';

export type SupplierCategoryView = {
  id: string;
  condominiumId: string;
  name: string;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class CondominiumSupplierCategoriesService {
  constructor(
    @InjectRepository(CondominiumSupplierCategory)
    private readonly categoryRepo: Repository<CondominiumSupplierCategory>,
    @InjectRepository(CondominiumSupplier)
    private readonly supplierRepo: Repository<CondominiumSupplier>,
    private readonly governance: GovernanceService,
  ) {}

  async findAll(
    condominiumId: string,
    userId: string,
  ): Promise<SupplierCategoryView[]> {
    await this.governance.assertManagement(condominiumId, userId);
    const rows = await this.categoryRepo.find({
      where: {
        condominiumId: In([
          SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID,
          condominiumId,
        ]),
      },
      order: { name: 'ASC' },
    });
    return sortSupplierCategoriesByName(rows.map((r) => this.map(r)));
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateSupplierCategoryDto,
  ): Promise<SupplierCategoryView> {
    await this.governance.assertManagement(condominiumId, userId);
    const name = dto.name.trim();
    await this.assertNameAvailable(condominiumId, name);
    const row = this.categoryRepo.create({ condominiumId, name });
    const saved = await this.categoryRepo.save(row);
    return this.map(saved);
  }

  async createForCondominiumByName(
    condominiumId: string,
    name: string,
  ): Promise<CondominiumSupplierCategory> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Informe o nome da categoria.');
    }
    const existing = await this.categoryRepo.findOne({
      where: { condominiumId, name: trimmed },
    });
    if (existing) {
      return existing;
    }
    await this.assertNameAvailable(condominiumId, trimmed);
    return this.categoryRepo.save(
      this.categoryRepo.create({ condominiumId, name: trimmed }),
    );
  }

  async update(
    condominiumId: string,
    categoryId: string,
    userId: string,
    dto: UpdateSupplierCategoryDto,
  ): Promise<SupplierCategoryView> {
    await this.governance.assertManagement(condominiumId, userId);
    const row = await this.findEditableInCondominium(condominiumId, categoryId);
    const name = dto.name.trim();
    if (name !== row.name) {
      await this.assertNameAvailable(condominiumId, name, categoryId);
      row.name = name;
    }
    const saved = await this.categoryRepo.save(row);
    return this.map(saved);
  }

  async remove(
    condominiumId: string,
    categoryId: string,
    userId: string,
  ): Promise<void> {
    await this.governance.assertManagement(condominiumId, userId);
    await this.findEditableInCondominium(condominiumId, categoryId);
    const linked = await this.supplierRepo.count({
      where: { categoryId },
    });
    if (linked > 0) {
      throw new BadRequestException(
        'Categoria vinculada a fornecedores; não é possível excluir.',
      );
    }
    await this.categoryRepo.delete({ id: categoryId, condominiumId });
  }

  async resolveCategoryIdForSupplier(
    condominiumId: string,
    input: {
      categoryId?: string | null;
      newCategoryName?: string | null;
    },
  ): Promise<string | null> {
    const newName = (input.newCategoryName ?? '').trim();
    if (newName) {
      const created = await this.createForCondominiumByName(condominiumId, newName);
      return created.id;
    }
    if (input.categoryId === undefined || input.categoryId === null) {
      return null;
    }
    const categoryId = input.categoryId.trim();
    if (!categoryId) {
      return null;
    }
    await this.assertCategoryAssignable(condominiumId, categoryId);
    return categoryId;
  }

  async assertCategoryAssignable(
    condominiumId: string,
    categoryId: string,
  ): Promise<CondominiumSupplierCategory> {
    const row = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!row) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    if (
      row.condominiumId !== SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID &&
      row.condominiumId !== condominiumId
    ) {
      throw new BadRequestException('Categoria inválida para este condomínio.');
    }
    return row;
  }

  async findCategoryView(
    categoryId: string | null,
  ): Promise<Pick<SupplierCategoryView, 'id' | 'name' | 'isGlobal'> | null> {
    if (!categoryId) {
      return null;
    }
    const row = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      isGlobal: row.condominiumId === SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID,
    };
  }

  private async findEditableInCondominium(
    condominiumId: string,
    categoryId: string,
  ): Promise<CondominiumSupplierCategory> {
    const row = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!row) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    if (row.condominiumId === SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID) {
      throw new ForbiddenException('Categorias padrão não podem ser alteradas.');
    }
    if (row.condominiumId !== condominiumId) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    return row;
  }

  private async assertNameAvailable(
    condominiumId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const global = await this.categoryRepo.findOne({
      where: {
        condominiumId: SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID,
        name,
      },
    });
    if (global && global.id !== excludeId) {
      throw new BadRequestException(
        'Já existe uma categoria padrão com este nome.',
      );
    }
    const local = await this.categoryRepo.findOne({
      where: { condominiumId, name },
    });
    if (local && local.id !== excludeId) {
      throw new BadRequestException(
        'Já existe uma categoria do condomínio com este nome.',
      );
    }
  }

  private map(row: CondominiumSupplierCategory): SupplierCategoryView {
    return {
      id: row.id,
      condominiumId: row.condominiumId,
      name: row.name,
      isGlobal: row.condominiumId === SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
