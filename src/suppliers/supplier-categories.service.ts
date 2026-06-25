import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { SupplierCategory } from './entities/supplier-category.entity';

@Injectable()
export class SupplierCategoriesService {
  constructor(
    @InjectRepository(SupplierCategory)
    private readonly categoryRepo: Repository<SupplierCategory>,
    private readonly condominiumsService: CondominiumsService,
  ) {}

  async listForCondominium(
    condominiumId: string,
    userId: string,
  ): Promise<SupplierCategory[]> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    return this.categoryRepo
      .createQueryBuilder('c')
      .where('c.created_by_user_id IS NULL OR c.created_by_user_id = :uid', {
        uid: userId,
      })
      .orderBy('c.name', 'ASC')
      .getMany();
  }

  async createForCondominium(
    condominiumId: string,
    userId: string,
    dto: CreateSupplierCategoryDto,
  ): Promise<SupplierCategory> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Nome da categoria é obrigatório.');
    }
    const dup = await this.categoryRepo
      .createQueryBuilder('c')
      .where('c.created_by_user_id = :uid', { uid: userId })
      .andWhere('LOWER(c.name) = LOWER(:name)', { name })
      .getOne();
    if (dup) {
      throw new BadRequestException('Já existe uma categoria sua com esse nome.');
    }
    const row = this.categoryRepo.create({
      name,
      createdByUserId: userId,
    });
    return this.categoryRepo.save(row);
  }

  /** Categoria global do seed (ex.: «Outros»), `created_by_user_id` nulo. */
  async findGlobalByName(name: string): Promise<SupplierCategory | null> {
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    return this.categoryRepo
      .createQueryBuilder('c')
      .where('c.created_by_user_id IS NULL')
      .andWhere('LOWER(c.name) = LOWER(:name)', { name: trimmed })
      .getOne();
  }

  async assertCategorySelectable(
    categoryId: string,
    userId: string,
  ): Promise<SupplierCategory> {
    const c = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!c) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    if (
      c.createdByUserId !== null &&
      c.createdByUserId !== userId
    ) {
      throw new BadRequestException(
        'Esta categoria não está disponível para a sua conta.',
      );
    }
    return c;
  }
}
