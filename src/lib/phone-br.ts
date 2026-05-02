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

/**
 * Formato que alguns fornecedores (ex.: Twilio/WhatsApp) esperam para BR móvel: `55` + DDD
 * + 8 subscritores, **sem** o 9o dígito móvel após o DDD.
 * Usar **apenas** no envio; não grava o número alterado na base.
 *
 * @param phoneDigits Só dígitos, p.ex. o valor já normalizado com 55
 */
export function toWhatsAppE164BrDigits(phoneDigits: string): string {
  const d = phoneDigits.replace(/\D/g, '');
  if (!d.startsWith('55')) {
    return d;
  }
  const national = d.slice(2);
  // DDD (2) + 9 móvel + 8, ou padrão legado/entrada 10 nacionais com 9
  if (
    (national.length === 10 || national.length === 11) &&
    national[2] === '9'
  ) {
    return `55${national.slice(0, 2)}${national.slice(3)}`;
  }
  return d;
}
