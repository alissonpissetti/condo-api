import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeBrCellphone } from '../lib/phone-br';
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

  /**
   * ID canônico em `people` / `unit_responsible_people` (preserva maiúsculas do UUID).
   * Comparação case-insensitive para aceitar o valor vindo do front.
   */
  private async resolveFinancialResponsiblePersonIdForUnit(
    unitId: string,
    personId: string,
  ): Promise<string> {
    const trimmed = personId.trim();
    const row = await this.unitResponsibleRepo
      .createQueryBuilder('urp')
      .where('urp.unitId = :unitId', { unitId })
      .andWhere('LOWER(urp.personId) = LOWER(:personId)', { personId: trimmed })
      .getOne();
    if (!row) {
      throw new BadRequestException(
        'O responsável financeiro deve ser uma das pessoas já associadas como responsável desta unidade.',
      );
    }
    return row.personId;
  }

  private async assertFinancialResponsiblePerson(
    unitId: string,
    personId: string | null | undefined,
  ): Promise<void> {
    if (personId === undefined || personId === null) {
      return;
    }
    await this.resolveFinancialResponsiblePersonIdForUnit(unitId, personId);
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
          : await this.resolveFinancialResponsiblePersonIdForUnit(
              unit.id,
              dto.financialResponsiblePersonId,
            );
      await this.unitRepo.update(
        { id: unit.id, groupingId },
        { financialResponsiblePersonId: pid },
      );
    }
    if (dto.pendingWhatsappPhone !== undefined) {
      const responsibleCount = await this.unitResponsibleRepo.count({
        where: { unitId: unit.id },
      });
      const hasLinkedPerson =
        !!unit.ownerPersonId || responsibleCount > 0;
      const raw = dto.pendingWhatsappPhone;
      if (raw === null || (typeof raw === 'string' && !raw.trim())) {
        unit.pendingWhatsappPhone = null;
      } else if (hasLinkedPerson) {
        throw new BadRequestException(
          'Não é possível salvar WhatsApp de referência: a unidade já tem proprietário ou responsável com ficha. Limpe primeiro ou use o telefone na ficha da pessoa.',
        );
      } else {
        const norm = normalizeBrCellphone(raw);
        if (!norm) {
          throw new BadRequestException('Celular inválido.');
        }
        const national = norm.startsWith('55') ? norm.slice(2) : norm;
        if (national.length !== 11 || national[2] !== '9') {
          throw new BadRequestException(
            'Indique um celular válido com DDD (11 dígitos, 9 após o DDD).',
          );
        }
        unit.pendingWhatsappPhone = norm;
      }
    }

    const needsEntitySave =
      dto.identifier !== undefined ||
      dto.floor !== undefined ||
      dto.notes !== undefined ||
      dto.ownerDisplayName !== undefined ||
      dto.responsibleDisplayName !== undefined ||
      dto.pendingWhatsappPhone !== undefined;

    if (needsEntitySave) {
      let toSave = unit;
      if (dto.financialResponsiblePersonId !== undefined) {
        const fresh = await this.unitRepo.findOne({
          where: { id: unit.id, groupingId },
        });
        if (!fresh) {
          throw new NotFoundException('Unit not found');
        }
        if (dto.identifier !== undefined) {
          fresh.identifier = unit.identifier;
        }
        if (dto.floor !== undefined) {
          fresh.floor = unit.floor;
        }
        if (dto.notes !== undefined) {
          fresh.notes = unit.notes;
        }
        if (dto.ownerDisplayName !== undefined) {
          fresh.ownerDisplayName = unit.ownerDisplayName;
        }
        if (dto.responsibleDisplayName !== undefined) {
          fresh.responsibleDisplayName = unit.responsibleDisplayName;
        }
        if (dto.pendingWhatsappPhone !== undefined) {
          fresh.pendingWhatsappPhone = unit.pendingWhatsappPhone;
        }
        toSave = fresh;
      }
      await this.unitRepo.save(toSave);
    }

    const reloaded = await this.unitRepo.findOne({
      where: { id: unit.id, groupingId },
      relations: {
        ownerPerson: true,
        responsibleLinks: { person: true },
        financialResponsiblePerson: true,
      },
    });
    if (!reloaded) {
      throw new NotFoundException('Unit not found');
    }
    flattenUnitResponsiblesForApi(reloaded);
    return reloaded;
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
