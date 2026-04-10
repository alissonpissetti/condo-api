import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { CreateGroupingDto } from './dto/create-grouping.dto';
import { UpdateGroupingDto } from './dto/update-grouping.dto';
import { Grouping } from './grouping.entity';

@Injectable()
export class GroupingsService {
  constructor(
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    private readonly condominiumsService: CondominiumsService,
  ) {}

  async findAll(condominiumId: string, userId: string): Promise<Grouping[]> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    return this.groupingRepo.find({
      where: { condominiumId },
      order: { createdAt: 'ASC' },
    });
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateGroupingDto,
  ): Promise<Grouping> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const grouping = this.groupingRepo.create({
      condominiumId,
      name: dto.name,
    });
    return this.groupingRepo.save(grouping);
  }

  async findOne(
    condominiumId: string,
    groupingId: string,
    userId: string,
  ): Promise<Grouping> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const g = await this.groupingRepo.findOne({
      where: { id: groupingId, condominiumId },
    });
    if (!g) {
      throw new NotFoundException('Grouping not found');
    }
    return g;
  }

  async update(
    condominiumId: string,
    groupingId: string,
    userId: string,
    dto: UpdateGroupingDto,
  ): Promise<Grouping> {
    const grouping = await this.findOne(condominiumId, groupingId, userId);
    if (dto.name !== undefined) {
      grouping.name = dto.name;
    }
    return this.groupingRepo.save(grouping);
  }

  async remove(
    condominiumId: string,
    groupingId: string,
    userId: string,
  ): Promise<void> {
    await this.findOne(condominiumId, groupingId, userId);
    const count = await this.groupingRepo.count({ where: { condominiumId } });
    if (count <= 1) {
      throw new BadRequestException('Cannot delete the last grouping');
    }
    await this.groupingRepo.delete(groupingId);
  }
}
