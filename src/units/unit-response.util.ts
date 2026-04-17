import type { Unit } from './unit.entity';

/**
 * Expõe `responsiblePeople` + campos legados (`responsiblePerson` = primeiro)
 * e remove `responsibleLinks` do JSON para não duplicar `person`.
 */
export function flattenUnitResponsiblesForApi(unit: Unit): void {
  const u = unit as Unit & {
    responsiblePeople?: {
      id: string;
      fullName: string;
      phone?: string | null;
    }[];
    responsiblePerson?: {
      id: string;
      fullName: string;
      phone?: string | null;
    } | null;
    responsiblePersonId?: string | null;
    responsibleLinks?: unknown;
  };
  const links = u.responsibleLinks as
    | Array<{
        person?: {
          id: string;
          fullName: string;
          phone?: string | null;
        } | null;
      }>
    | undefined;
  type PersonRef = {
    id: string;
    fullName: string;
    phone?: string | null;
  };
  const people = (links ?? [])
    .map((l) => l.person)
    .filter((p): p is PersonRef => !!p?.id)
    .map((p) => ({
      id: p.id,
      fullName: p.fullName,
      phone: p.phone ?? null,
    }));
  u.responsiblePeople = people;
  u.responsiblePerson = people[0] ?? null;
  u.responsiblePersonId = people[0]?.id ?? null;
  Reflect.deleteProperty(unit as object, 'responsibleLinks');
}
