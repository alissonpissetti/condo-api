import type { FinancialRecurrenceFrequency } from './entities/financial-transaction-recurrence.entity';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Retorna `YYYY-MM-DD` em UTC a partir de um `Date` (usa componentes UTC). */
export function utcYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Interpreta `YYYY-MM-DD` como meia-noite UTC. */
export function parseUtcYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    throw new Error(`Invalid date string: ${s}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo, d));
}

function addMonthsUtc(
  y: number,
  m: number,
  day: number,
  monthsToAdd: number,
): Date {
  const nm = m + monthsToAdd;
  const lastDayOfTarget = new Date(Date.UTC(y, nm + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTarget);
  return new Date(Date.UTC(y, nm, clampedDay));
}

export function addRecurrenceOccurrence(
  from: Date,
  frequency: FinancialRecurrenceFrequency,
): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const d = from.getUTCDate();
  switch (frequency) {
    case 'weekly':
      return new Date(Date.UTC(y, m, d + 7));
    case 'biweekly':
      return new Date(Date.UTC(y, m, d + 14));
    case 'monthly':
      return addMonthsUtc(y, m, d, 1);
    case 'semiannual':
      return addMonthsUtc(y, m, d, 6);
    case 'yearly':
      return addMonthsUtc(y, m, d, 12);
    default: {
      const _exhaustive: never = frequency;
      return _exhaustive;
    }
  }
}

export function competencyFromOccurred(
  occurred: Date,
  align: 'same_as_occurrence' | 'month_start',
): string {
  if (align === 'same_as_occurrence') {
    return utcYmd(occurred);
  }
  const y = occurred.getUTCFullYear();
  const m = occurred.getUTCMonth();
  return utcYmd(new Date(Date.UTC(y, m, 1)));
}
