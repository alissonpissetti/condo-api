import type { Person } from '../people/person.entity';

type ResponsibleLink = { person?: Pick<Person, 'fullName'> | null };

/**
 * Nome único para exibição financeira (taxas, PDFs): prioriza o responsável
 * financeiro designado; com um só responsável na ficha usa esse; com vários
 * sem designação devolve `null` (a UI pode pedir para definir).
 */
export function resolveUnitFinancialResponsibleDisplayName(u: {
  financialResponsiblePerson?: Pick<Person, 'fullName'> | null;
  responsibleLinks?: ResponsibleLink[] | null;
  responsibleDisplayName?: string | null;
}): string | null {
  const designated = u.financialResponsiblePerson?.fullName?.trim();
  if (designated) {
    return designated;
  }
  const links = u.responsibleLinks ?? [];
  const names = links
    .map((l) => l.person?.fullName?.trim())
    .filter((x): x is string => !!x);
  if (names.length === 1) {
    return names[0]!;
  }
  const manual = u.responsibleDisplayName?.trim();
  if (manual) {
    return manual;
  }
  if (names.length > 1) {
    return null;
  }
  return null;
}
