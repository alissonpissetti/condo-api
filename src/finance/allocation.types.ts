/** Regra de rateio persistida em JSON (coluna allocation_rule). */
export type AllocationRule =
  | { kind: 'all_units_equal' }
  | { kind: 'unit_ids'; unitIds: string[] }
  | { kind: 'grouping_ids'; groupingIds: string[] }
  | { kind: 'all_units_except'; excludeUnitIds: string[] }
  | { kind: 'none' };

export function isAllocationRule(x: unknown): x is AllocationRule {
  if (!x || typeof x !== 'object' || !('kind' in x)) return false;
  const k = (x as { kind: string }).kind;
  switch (k) {
    case 'all_units_equal':
      return true;
    case 'none':
      return true;
    case 'unit_ids': {
      const o = x as unknown as { unitIds?: unknown };
      return (
        Array.isArray(o.unitIds) &&
        o.unitIds.every((id) => typeof id === 'string')
      );
    }
    case 'grouping_ids': {
      const o = x as unknown as { groupingIds?: unknown };
      return (
        Array.isArray(o.groupingIds) &&
        o.groupingIds.every((id) => typeof id === 'string')
      );
    }
    case 'all_units_except': {
      const o = x as unknown as { excludeUnitIds?: unknown };
      return (
        Array.isArray(o.excludeUnitIds) &&
        o.excludeUnitIds.every((id) => typeof id === 'string')
      );
    }
    default:
      return false;
  }
}
