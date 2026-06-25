import { BadRequestException } from '@nestjs/common';
import type { AllocationRule } from '../finance/allocation.types';
import { isAllocationRule } from '../finance/allocation.types';
import type { CondominiumWork } from './entities/condominium-work.entity';

export const DEFAULT_WORK_ALLOCATION_RULE: AllocationRule = {
  kind: 'all_units_equal',
};

export function getWorkAllocationRule(
  work: Pick<CondominiumWork, 'allocationRule'>,
): AllocationRule {
  const raw = work.allocationRule;
  if (raw && isAllocationRule(raw) && raw.kind !== 'none') {
    return raw;
  }
  return DEFAULT_WORK_ALLOCATION_RULE;
}

export function parseWorkAllocationRuleInput(rule: unknown): AllocationRule {
  if (!isAllocationRule(rule)) {
    throw new BadRequestException('Regra de rateio inválida.');
  }
  if (rule.kind === 'none') {
    throw new BadRequestException(
      'Obra não pode usar «sem repartição»; escolha quem participa do rateio.',
    );
  }
  return rule;
}
