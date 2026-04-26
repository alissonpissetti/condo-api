import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GovernanceService } from '../planning/governance.service';
import { Grouping } from '../groupings/grouping.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { Unit } from './unit.entity';
import { UnitResponsiblePerson } from './unit-responsible-person.entity';
import { flattenUnitResponsiblesForApi } from './unit-response.util';

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
    @InjectRepository(UnitResponsiblePerson)
    private readonly unitResponsibleRepo: Repository<UnitResponsiblePerson>,
    private readonly governanceService: GovernanceService,
  ) {}

  private async assertFinancialResponsiblePerson(
    unitId: string,
    personId: string | null | undefined,
  ): Promise<void> {
    if (personId === undefined || personId === null) {
      return;
    }
    const ok = await this.unitResponsibleRepo.exist({
      where: { unitId, personId },
    });
    if (!ok) {
      throw new BadRequestException(
        'O responsável financeiro tem de ser uma das pessoas já associadas como responsável desta unidade.',
      );
    }
  }

  private async requireGroupingInCondo(
    condominiumId: string,
    groupingId: string,
  ): Promise<Grouping> {
    const grouping = await this.groupingRepo.findOne({
      where: { id: groupingId, condominiumId },
    });
    if (!grouping) {
      throw new NotFoundException('Grouping not found in this condominium');
    }
    return grouping;
  }

  private async assertGroupingReadable(
    condominiumId: string,
    groupingId: string,
    userId: string,
  ): Promise<Grouping> {
    await this.governanceService.assertAnyAccess(condominiumId, userId);
    return this.requireGroupingInCondo(condominiumId, groupingId);
  }

  private async assertGroupingManaged(
    condominiumId: string,
    groupingId: string,
    userId: string,
  ): Promise<Grouping> {
    await this.governanceService.assertManagement(condominiumId, userId);
    return this.requireGroupingInCondo(condominiumId, groupingId);
  }

  async findAll(
    condominiumId: string,
    groupingId: string,
    userId: string,
  ): Promise<Unit[]> {
    await this.assertGroupingReadable(condominiumId, groupingId, userId);
    const rows = await this.unitRepo.find({
      where: { groupingId },
      relations: {
        ownerPerson: true,
        responsibleLinks: { person: true },
        financialResponsiblePerson: true,
      },
      order: { createdAt: 'ASC' },
    });
    for (const u of rows) {
      flattenUnitResponsiblesForApi(u);
    }
    return rows;
  }

  async create(
    condominiumId: string,
    groupingId: string,
    userId: string,
    dto: CreateUnitDto,
  ): Promise<Unit> {
    await this.assertGroupingManaged(condominiumId, groupingId, userId);
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
    const saved = await this.unitRepo.save(unit);
    saved.responsibleLinks = [];
    flattenUnitResponsiblesForApi(saved);
    return saved;
  }

  async findOne(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
  ): Promise<Unit> {
    await this.assertGroupingReadable(condominiumId, groupingId, userId);
    const unit = await this.unitRepo.findOne({
      where: { id: unitId, groupingId },
      relations: {
        ownerPerson: true,
        responsibleLinks: { person: true },
        financialResponsiblePerson: true,
      },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    flattenUnitResponsiblesForApi(unit);
    return unit;
  }

  async update(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
    dto: UpdateUnitDto,
  ): Promise<Unit> {
    await this.assertGroupingManaged(condominiumId, groupingId, userId);
    const unit = await this.unitRepo.findOne({
      where: { id: unitId, groupingId },
      relations: {
        ownerPerson: true,
        responsibleLinks: { person: true },
        financialResponsiblePerson: true,
      },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
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
    if (dto.financialResponsiblePersonId !== undefined) {
      const pid =
        dto.financialResponsiblePersonId === null
          ? null
          : dto.financialResponsiblePersonId.trim();
      await this.assertFinancialResponsiblePerson(unit.id, pid);
      unit.financialResponsiblePersonId = pid;
    }
    const saved = await this.unitRepo.save(unit);
    const withLinks = await this.unitRepo.findOne({
      where: { id: saved.id, groupingId },
      relations: {
        ownerPerson: true,
        responsibleLinks: { person: true },
        financialResponsiblePerson: true,
      },
    });
    if (withLinks) {
      flattenUnitResponsiblesForApi(withLinks);
      return withLinks;
    }
    flattenUnitResponsiblesForApi(saved);
    return saved;
  }

  async remove(
    condominiumId: string,
    groupingId: string,
    unitId: string,
    userId: string,
  ): Promise<void> {
    await this.assertGroupingManaged(condominiumId, groupingId, userId);
    const n = await this.unitRepo.count({ where: { id: unitId, groupingId } });
    if (n === 0) {
      throw new NotFoundException('Unit not found');
    }
    await this.unitRepo.delete(unitId);
  }
}
