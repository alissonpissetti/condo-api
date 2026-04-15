/** Datas de calendário em YYYY-MM-DD (comparáveis lexicograficamente). */

export const DEFAULT_SAAS_BILLING_TZ = 'America/Sao_Paulo';

export function calendarYmdInTz(isoDate: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(isoDate);
}

export function todayYmdInTz(tz: string): string {
  return calendarYmdInTz(new Date(), tz);
}

/** Dia do mês (1–31) da data no fuso indicado. */
export function dueDayOfMonthFromDate(isoDate: Date, tz: string): number {
  const d = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    day: 'numeric',
  }).format(isoDate);
  return Math.min(31, Math.max(1, parseInt(d, 10)));
}

export function addCalendarDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * 86400000;
  const x = new Date(t);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

/** Soma meses mantendo o dia quando possível (ex.: 31 Jan +1m → 28/29 Fev). */
export function addCalendarMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const dd = Math.min(d, lastDay);
  return `${ty}-${String(tm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function compareYmd(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function ymdWithDayInMonth(y: number, m: number, dueDay: number): string {
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dd = Math.min(dueDay, lastDay);
  return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** Primeiro vencimento: um mês após a data de criação do condomínio, no dia de vencimento. */
export function firstSubscriptionDueYmd(
  condoCreatedYmd: string,
  dueDay: number,
): string {
  const [y, m] = condoCreatedYmd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + 1, 1));
  const ty = t.getUTCFullYear();
  const tm = t.getUTCMonth() + 1;
  return ymdWithDayInMonth(ty, tm, dueDay);
}

/** Próximo vencimento após o último `due_date` já facturado. */
export function nextSubscriptionDueAfter(
  lastDueYmd: string,
  dueDay: number,
): string {
  const [y, m] = lastDueYmd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + 1, 1));
  const ty = t.getUTCFullYear();
  const tm = t.getUTCMonth() + 1;
  return ymdWithDayInMonth(ty, tm, dueDay);
}
