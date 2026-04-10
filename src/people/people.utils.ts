/** CEP: só dígitos, 8 caracteres. */
export function normalizeCepDigits(input: string): string {
  return input.replace(/\D/g, '').slice(0, 8);
}

/** Remove máscara e limita a 11 dígitos. */
export function normalizeCpf(input: string | undefined): string | null {
  if (!input?.trim()) {
    return null;
  }
  const d = input.replace(/\D/g, '').slice(0, 11);
  return d.length === 0 ? null : d;
}

export function normalizeEmail(input: string | undefined): string | null {
  if (!input?.trim()) {
    return null;
  }
  return input.trim().toLowerCase();
}

/** Validação simples de CPF (11 dígitos + dígitos verificadores). */
export function isValidCpf(digits: string): boolean {
  if (digits.length !== 11) {
    return false;
  }
  if (/^(\d)\1{10}$/.test(digits)) {
    return false;
  }
  let sum = 0;
  let rest: number;
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(digits.substring(i - 1, i), 10) * (11 - i);
  }
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) {
    rest = 0;
  }
  if (rest !== parseInt(digits.substring(9, 10), 10)) {
    return false;
  }
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(digits.substring(i - 1, i), 10) * (12 - i);
  }
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) {
    rest = 0;
  }
  if (rest !== parseInt(digits.substring(10, 11), 10)) {
    return false;
  }
  return true;
}
