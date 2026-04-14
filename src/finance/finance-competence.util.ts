/** Ultimo dia (inclusive) do mes de competencia AAAA-MM, como YYYY-MM-DD. */
export function lastDayOfCompetenceYm(ym: string): string {
  const [ys, ms] = ym.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error('Invalid competence ym');
  }
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

/** Primeiro dia do mês de competência. */
export function firstDayOfCompetenceYm(ym: string): string {
  return `${ym}-01`;
}

/**
 * Vencimento padrão: dia 10 do mês seguinte à competência.
 * Ex.: competência 2026-03 → 2026-04-10
 */
export function dueDateForCompetenceYm(ym: string): Date {
  const [ys, ms] = ym.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error('Invalid competence ym');
  }
  return new Date(Date.UTC(y, m, 10));
}

/** Competência = mês civil anterior à data (UTC). */
export function previousCalendarYmFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const monthIndex = d.getUTCMonth();
  const prev = new Date(Date.UTC(y, monthIndex - 1, 1));
  const yy = prev.getUTCFullYear();
  const mm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

export function isValidCompetenceYm(s: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(s)) return false;
  const m = Number(s.slice(5));
  return m >= 1 && m <= 12;
}

/** `a` <= `b` para strings AAAA-MM. */
export function ymCompare(a: string, b: string): number {
  return a.localeCompare(b);
}
