import type { Person } from '../people/person.entity';

type ResponsiblePersonFields = Pick<Person, 'fullName'> &
  Partial<Pick<Person, 'cpf' | 'addressCity'>>;

type ResponsibleLink = {
  person?: ResponsiblePersonFields | null;
};

export type UnitFinancialResponsibleInfo = {
  name: string;
  cpf: string | null;
  addressCity: string | null;
};

function pickResponsiblePerson(
  person: ResponsiblePersonFields,
): UnitFinancialResponsibleInfo {
  return {
    name: person.fullName.trim(),
    cpf: person.cpf ?? null,
    addressCity: person.addressCity?.trim() || null,
  };
}

/**
 * Dados do responsável financeiro da unidade (taxas, PDFs): prioriza o
 * responsável designado; com um só responsável na ficha usa esse; depois
 * rótulo manual; por fim proprietário cadastrado.
 */
export function resolveUnitFinancialResponsiblePerson(u: {
  financialResponsiblePerson?: ResponsiblePersonFields | null;
  responsibleLinks?: ResponsibleLink[] | null;
  responsibleDisplayName?: string | null;
  ownerPerson?: ResponsiblePersonFields | null;
  ownerDisplayName?: string | null;
}): UnitFinancialResponsibleInfo {
  const designated = u.financialResponsiblePerson?.fullName?.trim();
  if (designated && u.financialResponsiblePerson) {
    return pickResponsiblePerson(u.financialResponsiblePerson);
  }

  const links = u.responsibleLinks ?? [];
  const persons = links
    .map((l) => l.person)
    .filter((p): p is ResponsiblePersonFields => !!p?.fullName?.trim());
  if (persons.length === 1) {
    return pickResponsiblePerson(persons[0]!);
  }

  const manual = u.responsibleDisplayName?.trim();
  if (manual) {
    return { name: manual, cpf: null, addressCity: null };
  }

  const ownerName = u.ownerPerson?.fullName?.trim();
  if (ownerName && u.ownerPerson) {
    return pickResponsiblePerson(u.ownerPerson);
  }
  const ownerLabel = u.ownerDisplayName?.trim();
  if (ownerLabel) {
    return { name: ownerLabel, cpf: null, addressCity: null };
  }

  return { name: '—', cpf: null, addressCity: null };
}

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
  const info = resolveUnitFinancialResponsiblePerson(u);
  if (info.name === '—') {
    const links = u.responsibleLinks ?? [];
    const names = links
      .map((l) => l.person?.fullName?.trim())
      .filter((x): x is string => !!x);
    if (names.length > 1) {
      return null;
    }
    return null;
  }
  return info.name;
}
