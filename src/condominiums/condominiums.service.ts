import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Grouping } from '../groupings/grouping.entity';
import { Condominium } from './condominium.entity';
import { CreateCondominiumDto } from './dto/create-condominium.dto';
import { UpdateCondominiumDto } from './dto/update-condominium.dto';

@Injectable()
export class CondominiumsService {
  constructor(
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    private readonly dataSource: DataSource,
  ) {}

  async assertOwner(
    condominiumId: string,
    userId: string,
  ): Promise<Condominium> {
    const condo = await this.condoRepo.findOne({
      where: { id: condominiumId, ownerId: userId },
    });
    if (!condo) {
      throw new ForbiddenException('Condominium not found or access denied');
    }
    return condo;
  }

  findAllForOwner(userId: string): Promise<Condominium[]> {
    return this.condoRepo.find({
      where: { ownerId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneForOwner(id: string, userId: string): Promise<Condominium> {
    const condo = await this.condoRepo.findOne({
      where: { id, ownerId: userId },
    });
    if (!condo) {
      throw new NotFoundException('Condominium not found');
    }
    return condo;
  }

  async create(
    userId: string,
    dto: CreateCondominiumDto,
  ): Promise<Condominium> {
    return this.dataSource.transaction(async (manager) => {
      const condo = manager.create(Condominium, {
        ownerId: userId,
        name: dto.name,
      });
      await manager.save(condo);
      const grouping = manager.create(Grouping, {
        condominiumId: condo.id,
        name: 'Geral',
      });
      await manager.save(grouping);
      return condo;
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCondominiumDto,
  ): Promise<Condominium> {
    const condo = await this.findOneForOwner(id, userId);
    if (dto.name !== undefined) {
      condo.name = dto.name;
    }
    return this.condoRepo.save(condo);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOneForOwner(id, userId);
    await this.condoRepo.delete(id);
  }
}
