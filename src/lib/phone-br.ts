/**
 * Normaliza telefone brasileiro para apenas dígitos com prefixo 55.
 * Aceita entrada com máscara, espaços, +55, etc.
 */
export function normalizeBrCellphone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (!digits.length) {
    return null;
  }
  if (digits.startsWith('55')) {
    if (digits.length < 12 || digits.length > 15) {
      return null;
    }
    return digits;
  }
  if (digits.length === 11) {
    return `55${digits}`;
  }
  if (digits.length === 10) {
    return `55${digits}`;
  }
  return null;
}

/**
 * Destinatário no POST `/api/v2/send` da Comtele: **DDD + número**, sem o prefixo 55.
 * @param normalizedWith55 Valor de {@link normalizeBrCellphone} (ex.: `5561999988888`)
 */
export function toComteleReceivers(normalizedWith55: string): string {
  const d = normalizedWith55.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) {
    return d.slice(2);
  }
  return d;
}
