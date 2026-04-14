/** `ym` no formato AAAA-MM; `add` meses a somar (pode ser negativo). */
export function addMonthsYm(ym: string, add: number): string {
  const [ys, ms] = ym.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    throw new Error('Invalid ym');
  }
  const d = new Date(Date.UTC(y, m - 1 + add, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}
