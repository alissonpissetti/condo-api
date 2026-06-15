export type ConstructionProjectStatus =
  | 'planned'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

export const CONSTRUCTION_PROJECT_STATUSES: ConstructionProjectStatus[] = [
  'planned',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
];

export function isConstructionProjectStatus(
  v: string,
): v is ConstructionProjectStatus {
  return (CONSTRUCTION_PROJECT_STATUSES as string[]).includes(v);
}
