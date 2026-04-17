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
import { flattenUnitResponsiblesForApi } from '../units/unit-response.util';
import { Grouping } from './grouping.entity';

@Injectable()
export class GroupingsService {
  constructor(
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    private readonly governanceService: GovernanceService,
  ) {}

  private async requireGrouping(
    condominiumId: string,
    groupingId: string,
  ): Promise<Grouping> {
    const g = await this.groupingRepo.findOne({
      where: { id: groupingId, condominiumId },
    });
    if (!g) {
      throw new NotFoundException('Grouping not found');
    }
    return g;
  }

  async findAll(condominiumId: string, userId: string): Promise<Grouping[]> {
    await this.governanceService.assertAnyAccess(condominiumId, userId);
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
    await this.governanceService.assertAnyAccess(condominiumId, userId);
    const groupings = await this.groupingRepo
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.units', 'u')
      .leftJoinAndSelect('u.ownerPerson', 'op')
      .leftJoinAndSelect('u.responsibleLinks', 'url')
      .leftJoinAndSelect('url.person', 'urlp')
      .where('g.condominiumId = :cid', { cid: condominiumId })
      .orderBy('g.createdAt', 'ASC')
      .addOrderBy('u.createdAt', 'ASC')
      .getMany();
    for (const g of groupings) {
      for (const u of g.units ?? []) {
        flattenUnitResponsiblesForApi(u);
      }
    }
    return groupings;
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
    await this.governanceService.assertAnyAccess(condominiumId, userId);
    return this.requireGrouping(condominiumId, groupingId);
  }

  async update(
    condominiumId: string,
    groupingId: string,
    userId: string,
    dto: UpdateGroupingDto,
  ): Promise<Grouping> {
    await this.governanceService.assertManagement(condominiumId, userId);
    const grouping = await this.requireGrouping(condominiumId, groupingId);
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
    await this.governanceService.assertManagement(condominiumId, userId);
    await this.requireGrouping(condominiumId, groupingId);
    const count = await this.groupingRepo.count({ where: { condominiumId } });
    if (count <= 1) {
      throw new BadRequestException('Cannot delete the last grouping');
    }
    await this.groupingRepo.delete(groupingId);
  }
}
