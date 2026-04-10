import { Person } from './person.entity';
import { normalizeCepDigits } from './people.utils';

/** Campos de endereço da ficha (pessoa) — alinhado a convites/unidades. */
export type PersonAddressInput = {
  addressZip: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement?: string | null;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
};

export function applyPersonAddressToEntity(
  person: Person,
  dto: PersonAddressInput,
): void {
  const zip = normalizeCepDigits(dto.addressZip);
  person.addressZip = zip.length === 8 ? zip : null;
  person.addressStreet = dto.addressStreet.trim();
  person.addressNumber = dto.addressNumber.trim();
  person.addressComplement = dto.addressComplement?.trim() || null;
  person.addressNeighborhood = dto.addressNeighborhood.trim();
  person.addressCity = dto.addressCity.trim();
  person.addressState = dto.addressState.trim().toUpperCase().slice(0, 2);
}
