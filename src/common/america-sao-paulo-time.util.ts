/** Fuso padrão do produto (condomínios no Brasil). */
export const APP_TIMEZONE = 'America/Sao_Paulo';

/**
 * `YYYY-MM-DDTHH:mm[:ss]` como horário civil em America/Sao_Paulo → instante UTC.
 * (Evita usar `new Date(y,m,d,h,...)` no fuso do servidor Docker/UTC.)
 */
export function parseSaoPauloLocalDateTime(raw: string): Date {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!m) {
    throw new Error('invalid sao paulo local datetime');
  }
  const y = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const d = Number.parseInt(m[3], 10);
  const h = Number.parseInt(m[4], 10);
  const mi = Number.parseInt(m[5], 10);
  const s = m[6] ? Number.parseInt(m[6], 10) : 0;

  let utcMs = Date.UTC(y, mo - 1, d, h + 3, mi, s);
  for (let attempt = 0; attempt < 4; attempt++) {
    const got = saoPauloPartsFromInstant(new Date(utcMs));
    if (
      got.year === y &&
      got.month === mo &&
      got.day === d &&
      got.hour === h &&
      got.minute === mi &&
      got.second === s
    ) {
      return new Date(utcMs);
    }
    const deltaMin =
      (h - got.hour) * 60 +
      (mi - got.minute) +
      (d - got.day) * 24 * 60;
    utcMs += deltaMin * 60 * 1000;
  }
  return new Date(utcMs);
}

export function saoPauloPartsFromInstant(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}
