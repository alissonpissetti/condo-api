/**
 * Converte YYYY-MM-DD (data civil da API/UI) em Date estável para colunas SQL `date`.
 *
 * `new Date("YYYY-MM-DD")` no JS é meia-noite **UTC**; em fusos atrás de UTC o driver
 * pode gravar o **dia anterior**. Usamos meio-dia UTC no dia civil desejado.
 */
export function parseDateOnlyFromApi(ymd: string): Date {
  const head = ymd.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) {
    return new Date(ymd);
  }
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  return new Date(Date.UTC(y, mo, d, 12, 0, 0, 0));
}

/** Formata coluna `date` / instante alinhado ao calendário UTC (YYYY-MM-DD). */
export function formatDateOnlyYmdUtc(value: Date | string): string {
  if (typeof value === 'string') {
    return value.trim().slice(0, 10);
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }
  const y = value.getUTCFullYear();
  const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** Data civil de hoje no fuso do servidor, como meio-dia UTC (coluna `date`). */
export function todayLocalCalendarAsUtcNoon(): Date {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return parseDateOnlyFromApi(ymd);
}
