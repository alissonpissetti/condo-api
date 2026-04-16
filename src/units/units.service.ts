import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GovernanceService } from '../planning/governance.service';
import { Grouping } from '../groupings/grouping.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { Unit } from './unit.entity';

@Injectable()
export class UnitsService {
  private static normalizeMemberDisplayLabel(
    value: string | null | undefined,
  ): string | null {
    const t = (value ?? '').trim();
    return t.length ? t : null;
  }

  constructor(
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    private readonly governanceService: GovernanceService,
  ) {}

  private async assertGroupingInCondo(
    condominiumId: string,
    groupingId: string,
    userId: string,
  ): Promise<Grouping> {
    await this.governanceService.assertManagement(condominiumId, userId);
    const grouping = await this.groupingRepo.findOne({
      where: { id: groupingId, condominiumId },
    });
    if (!grouping) {
      throw new NotFoundException('Grouping not found in this condominium');
    }
    return grouping;
  }

  async findAll(
    condominiumId: string,
    groupingId: string,
    userId: string,
  ): Promise<Unit[]> {
    await this.assertGroupingInCondo(condominiumId, groupingId, userId);
    return this.unitRepo.find({
      where: { groupingId },
      relations: { ownerPerson: true, responsiblePerson: true },
      order: { createdAt: 'ASC' },
    });
  }

  async create(
    condominiumId: string,
    groupingId: string,
    userId: string,
    dto: CreateUnitDto,
  ): Promise<Unit> {
    await this.assertGroupingInCondo(condominiumId, groupingId, userId);
    const unit = this.unitRepo.create({
      groupingId,
      identifier: dto.identifier,
      floor: dto.floor ?? null,
      notes: dto.notes ?? null,
      ownerDisplayName: UnitsService.normalizeMemberDisplayLabel(
        dto.ownerDisplayName,
      ),
      responsibleDisplayName: UnitsService.normalizeMemberDisplayLabel(
        dto.responsibleDisplayName,
      ),
    });
    return this.unitRepo.save(unit);
  }

  async findOne(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
  ): Promise<Unit> {
    await this.assertGroupingInCondo(condominiumId, groupingId, userId);
    const unit = await this.unitRepo.findOne({
      where: { id: unitId, groupingId },
      relations: { ownerPerson: true, responsiblePerson: true },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }

  async update(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
    dto: UpdateUnitDto,
  ): Promise<Unit> {
    const unit = await this.findOne(condominiumId, groupingId, unitId, userId);
    if (dto.identifier !== undefined) {
      unit.identifier = dto.identifier;
    }
    if (dto.floor !== undefined) {
      unit.floor = dto.floor;
    }
    if (dto.notes !== undefined) {
      unit.notes = dto.notes;
    }
    if (dto.ownerDisplayName !== undefined) {
      unit.ownerDisplayName = UnitsService.normalizeMemberDisplayLabel(
        dto.ownerDisplayName,
      );
    }
    if (dto.responsibleDisplayName !== undefined) {
      unit.responsibleDisplayName = UnitsService.normalizeMemberDisplayLabel(
        dto.responsibleDisplayName,
      );
    }
    return this.unitRepo.save(unit);
  }

  async remove(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
  ): Promise<void> {
    await this.findOne(condominiumId, groupingId, unitId, userId);
    await this.unitRepo.delete(unitId);
  }
}
