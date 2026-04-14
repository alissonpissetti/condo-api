import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GovernanceService } from '../planning/governance.service';
import { CreateGroupingDto } from './dto/create-grouping.dto';
import { UpdateGroupingDto } from './dto/update-grouping.dto';
import { Grouping } from './grouping.entity';

@Injectable()
export class GroupingsService {
  constructor(
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    private readonly governanceService: GovernanceService,
  ) {}

  async findAll(condominiumId: string, userId: string): Promise<Grouping[]> {
    await this.governanceService.assertManagement(condominiumId, userId);
    return this.groupingRepo.find({
      where: { condominiumId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Um único round-trip: agrupamentos com unidades (e titular/responsável).
   */
  async findAllWithUnits(
    condominiumId: string,
    userId: string,
  ): Promise<Grouping[]> {
    await this.governanceService.assertManagement(condominiumId, userId);
    return this.groupingRepo
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.units', 'u')
      .leftJoinAndSelect('u.ownerPerson', 'op')
      .leftJoinAndSelect('u.responsiblePerson', 'rp')
      .where('g.condominiumId = :cid', { cid: condominiumId })
      .orderBy('g.createdAt', 'ASC')
      .addOrderBy('u.createdAt', 'ASC')
      .getMany();
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateGroupingDto,
  ): Promise<Grouping> {
    await this.governanceService.assertManagement(condominiumId, userId);
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
    await this.governanceService.assertManagement(condominiumId, userId);
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
