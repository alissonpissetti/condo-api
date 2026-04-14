import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Grouping } from '../groupings/grouping.entity';
import { Unit } from '../units/unit.entity';
import type { AllocationRule } from './allocation.types';

@Injectable()
export class AllocationResolverService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
  ) {}

  /**
   * Lista ordenada de unit IDs do condomínio que entram no rateio.
   */
  async resolveUnitIds(
    condominiumId: string,
    rule: AllocationRule,
  ): Promise<string[]> {
    switch (rule.kind) {
      case 'none':
        return [];
      case 'all_units_equal': {
        const units = await this.allUnitIdsInCondominium(condominiumId);
        return units;
      }
      case 'all_units_except': {
        const all = new Set(await this.allUnitIdsInCondominium(condominiumId));
        for (const id of rule.excludeUnitIds) {
          if (!all.has(id)) {
            throw new BadRequestException(
              'Excluded unit is not in this condominium',
            );
          }
          all.delete(id);
        }
        return [...all].sort();
      }
      case 'unit_ids': {
        if (rule.unitIds.length === 0) {
          throw new BadRequestException('unit_ids must not be empty');
        }
        const valid = await this.assertUnitsInCondominium(
          condominiumId,
          rule.unitIds,
        );
        return [...valid].sort();
      }
      case 'grouping_ids': {
        if (rule.groupingIds.length === 0) {
          throw new BadRequestException('grouping_ids must not be empty');
        }
        const groupings = await this.groupingRepo.find({
          where: {
            condominiumId,
            id: In(rule.groupingIds),
          },
        });
        if (groupings.length !== rule.groupingIds.length) {
          throw new BadRequestException(
            'One or more groupings not found in this condominium',
          );
        }
        const units = await this.unitRepo.find({
          where: { groupingId: In(groupings.map((g) => g.id)) },
          select: { id: true },
        });
        const ids = [...new Set(units.map((u) => u.id))].sort();
        if (ids.length === 0) {
          throw new BadRequestException(
            'No units in the selected groupings for allocation',
          );
        }
        return ids;
      }
      default:
        throw new BadRequestException('Invalid allocation rule');
    }
  }

  private async allUnitIdsInCondominium(
    condominiumId: string,
  ): Promise<string[]> {
    const units = await this.unitRepo.find({
      where: { grouping: { condominiumId } },
      select: { id: true },
      order: { id: 'ASC' },
    });
    const ids = units.map((u) => u.id);
    if (ids.length === 0) {
      throw new BadRequestException(
        'No units in condominium for equal allocation',
      );
    }
    return ids;
  }

  private async assertUnitsInCondominium(
    condominiumId: string,
    unitIds: string[],
  ): Promise<string[]> {
    const unique = [...new Set(unitIds)];
    const units = await this.unitRepo.find({
      where: { id: In(unique), grouping: { condominiumId } },
      relations: { grouping: true },
    });
    if (units.length !== unique.length) {
      throw new BadRequestException(
        'One or more units not found in this condominium',
      );
    }
    return unique.sort();
  }
}
