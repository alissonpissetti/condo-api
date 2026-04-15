/** Janela do mês civil UTC [start, end) em ms, a partir de `referenceMonth` YYYY-MM. */
export function utcCivilMonthWindowMs(referenceMonth: string): {
  startMs: number;
  endExclMs: number;
} {
  const [y, m] = referenceMonth.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`referenceMonth inválido: ${referenceMonth}`);
  }
  const startMs = Date.UTC(y, m - 1, 1, 0, 0, 0, 0);
  const endExclMs = Date.UTC(y, m, 1, 0, 0, 0, 0);
  return { startMs, endExclMs };
}

/** Sobreposição em ms de [segStart, segEnd) com [winStart, winEnd); segEnd null = infinito. */
export function overlapIntervalMs(
  segStart: Date,
  segEndExcl: Date | null,
  winStartMs: number,
  winEndExclMs: number,
): number {
  const a = segStart.getTime();
  const b = segEndExcl ? segEndExcl.getTime() : Number.POSITIVE_INFINITY;
  const lo = Math.max(a, winStartMs);
  const hi = Math.min(b, winEndExclMs);
  return Math.max(0, hi - lo);
}
