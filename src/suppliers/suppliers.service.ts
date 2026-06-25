import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Supplier } from './entities/supplier.entity';
import { SupplierCategoriesService } from './supplier-categories.service';
import {
  normalizeDocumentCnpjCpf,
  normalizePixPair,
} from './supplier-pix-validation';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    private readonly condominiumsService: CondominiumsService,
    private readonly categoriesService: SupplierCategoriesService,
  ) {}

  async findAll(
    condominiumId: string,
    userId: string,
    categoryId?: string,
  ): Promise<Supplier[]> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const qb = this.supplierRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.category', 'category')
      .where('s.condominium_id = :cid', { cid: condominiumId })
      .orderBy('s.name', 'ASC');
    const cid = categoryId?.trim();
    if (cid) {
      qb.andWhere('s.category_id = :cat', { cat: cid });
    }
    return qb.getMany();
  }

  async findOne(
    condominiumId: string,
    supplierId: string,
    userId: string,
  ): Promise<Supplier> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const s = await this.supplierRepo.findOne({
      where: { id: supplierId, condominiumId },
      relations: ['category'],
    });
    if (!s) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }
    return s;
  }

  /**
   * Garante fornecedor no cadastro geral pelo nome (cria só com o nome em «Outros»
   * se ainda não existir no condomínio). Comparação sem diferenciar maiúsculas.
   */
  async ensureByName(
    condominiumId: string,
    userId: string,
    rawName: string,
  ): Promise<Supplier> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const name = rawName.trim();
    if (!name) {
      throw new BadRequestException('Nome do fornecedor inválido.');
    }
    const existing = await this.supplierRepo
      .createQueryBuilder('s')
      .where('s.condominium_id = :condominiumId', { condominiumId })
      .andWhere('LOWER(s.name) = LOWER(:name)', { name })
      .getOne();
    if (existing) {
      return existing;
    }
    const outrosCategory = await this.categoriesService.findGlobalByName('Outros');
    if (!outrosCategory) {
      throw new BadRequestException(
        'Categoria padrão «Outros» não encontrada no sistema.',
      );
    }
    const row = this.supplierRepo.create({
      condominiumId,
      categoryId: outrosCategory.id,
      name,
      legalName: null,
      documentCnpjCpf: null,
      pixKeyType: null,
      pixKeyValue: null,
      phone: null,
      email: null,
      notes: null,
      addressLine: null,
    });
    return this.supplierRepo.save(row);
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateSupplierDto,
  ): Promise<Supplier> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    await this.categoriesService.assertCategorySelectable(
      dto.categoryId,
      userId,
    );
    const { pixKeyType, pixKeyValue } = normalizePixPair(
      dto.pixKeyType,
      dto.pixKeyValue,
    );
    const documentCnpjCpf = normalizeDocumentCnpjCpf(dto.documentCnpjCpf);
    const row = this.supplierRepo.create({
      condominiumId,
      categoryId: dto.categoryId,
      name: dto.name.trim(),
      legalName: dto.legalName?.trim() || null,
      documentCnpjCpf,
      pixKeyType,
      pixKeyValue,
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim() || null,
      notes: dto.notes?.trim() || null,
      addressLine: dto.addressLine?.trim() || null,
    });
    return this.supplierRepo.save(row);
  }

  async update(
    condominiumId: string,
    supplierId: string,
    userId: string,
    dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    const s = await this.findOne(condominiumId, supplierId, userId);
    if (dto.categoryId !== undefined) {
      const category = await this.categoriesService.assertCategorySelectable(
        dto.categoryId,
        userId,
      );
      s.categoryId = category.id;
      s.category = category;
    }
    if (dto.name !== undefined) {
      const n = dto.name.trim();
      if (!n) {
        throw new BadRequestException('Nome é obrigatório.');
      }
      s.name = n;
    }
    if (dto.legalName !== undefined) {
      s.legalName = dto.legalName?.trim() || null;
    }
    if (dto.documentCnpjCpf !== undefined) {
      s.documentCnpjCpf = normalizeDocumentCnpjCpf(dto.documentCnpjCpf);
    }
    if (dto.pixKeyType !== undefined || dto.pixKeyValue !== undefined) {
      const { pixKeyType, pixKeyValue } = normalizePixPair(
        dto.pixKeyType ?? s.pixKeyType,
        dto.pixKeyValue ?? s.pixKeyValue,
      );
      s.pixKeyType = pixKeyType;
      s.pixKeyValue = pixKeyValue;
    }
    if (dto.phone !== undefined) {
      s.phone = dto.phone?.trim() || null;
    }
    if (dto.email !== undefined) {
      s.email = dto.email?.trim() || null;
    }
    if (dto.notes !== undefined) {
      s.notes = dto.notes?.trim() || null;
    }
    if (dto.addressLine !== undefined) {
      s.addressLine = dto.addressLine?.trim() || null;
    }
    return this.supplierRepo.save(s);
  }

  async remove(
    condominiumId: string,
    supplierId: string,
    userId: string,
  ): Promise<void> {
    const s = await this.findOne(condominiumId, supplierId, userId);
    await this.supplierRepo.remove(s);
  }
}
