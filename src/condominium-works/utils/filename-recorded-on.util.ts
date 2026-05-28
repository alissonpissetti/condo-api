/**
 * Infere data/hora de nomes comuns (WhatsApp, capturas de tela, câmera).
 */

type ParsedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function isValidParts(p: ParsedParts): boolean {
  if (p.month < 1 || p.month > 12 || p.day < 1 || p.day > 31) return false;
  if (p.hour < 0 || p.hour > 23 || p.minute < 0 || p.minute > 59) return false;
  if (p.second < 0 || p.second > 59) return false;
  const at = new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
  if (Number.isNaN(at.getTime())) return false;
  if (at.getTime() > Date.now()) return false;
  return true;
}

function partsToDate(p: ParsedParts): Date {
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
}

function tryPatterns(name: string): Date | null {
  const base = name.trim().replace(/^.*[/\\]/, '');
  const stem = base.replace(/\.[^.]+$/, '');

  const rules: Array<(s: string) => ParsedParts | null> = [
    (s) => {
      const m =
        /WhatsApp\s+(?:Image|Video|Audio|Document|Sticker|Ptt)\s+(\d{4})-(\d{2})-(\d{2})\s+(?:at|às)\s+(\d{1,2})\.(\d{2})(?:\.(\d{2}))?/i.exec(
          s,
        );
      if (!m) return null;
      return {
        year: +m[1],
        month: +m[2],
        day: +m[3],
        hour: +m[4],
        minute: +m[5],
        second: m[6] ? +m[6] : 0,
      };
    },
    (s) => {
      const m =
        /(?:IMG|VID|PTT|AUD|STK|DOC)-(\d{4})(\d{2})(\d{2})-/i.exec(s);
      if (!m) return null;
      return {
        year: +m[1],
        month: +m[2],
        day: +m[3],
        hour: 12,
        minute: 0,
        second: 0,
      };
    },
    (s) => {
      const m =
        /(?:Screenshot|Captura(?:\s+de\s+Tela)?)[_\s-]*(\d{4})[-]?(\d{2})[-]?(\d{2})[-_](\d{2})(\d{2})(\d{2})/i.exec(
          s,
        );
      if (!m) return null;
      return {
        year: +m[1],
        month: +m[2],
        day: +m[3],
        hour: +m[4],
        minute: +m[5],
        second: +m[6],
      };
    },
    (s) => {
      const m =
        /(?:Screenshot|Captura(?:\s+de\s+Tela)?)\s+(\d{4})-(\d{2})-(\d{2})\s+(?:at|às)\s+(\d{1,2})\.(\d{2})(?:\.(\d{2}))?/i.exec(
          s,
        );
      if (!m) return null;
      return {
        year: +m[1],
        month: +m[2],
        day: +m[3],
        hour: +m[4],
        minute: +m[5],
        second: m[6] ? +m[6] : 0,
      };
    },
    (s) => {
      const m =
        /(?:^|[^0-9])(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_](\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?:[^0-9]|$)/.exec(
          s,
        );
      if (!m) return null;
      return {
        year: +m[1],
        month: +m[2],
        day: +m[3],
        hour: +m[4],
        minute: +m[5],
        second: +m[6],
      };
    },
    (s) => {
      const m =
        /(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/.exec(s);
      if (!m) return null;
      return {
        year: +m[1],
        month: +m[2],
        day: +m[3],
        hour: +m[4],
        minute: +m[5],
        second: m[6] ? +m[6] : 0,
      };
    },
    (s) => {
      const m =
        /(\d{2})-(\d{2})-(\d{4})[ T](\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/.exec(s);
      if (!m) return null;
      return {
        year: +m[3],
        month: +m[2],
        day: +m[1],
        hour: +m[4],
        minute: +m[5],
        second: m[6] ? +m[6] : 0,
      };
    },
    (s) => {
      const m = /(?:^|[^0-9])(\d{4})(\d{2})(\d{2})(?:[^0-9]|$)/.exec(s);
      if (!m) return null;
      return {
        year: +m[1],
        month: +m[2],
        day: +m[3],
        hour: 12,
        minute: 0,
        second: 0,
      };
    },
  ];

  for (const rule of rules) {
    const parts = rule(stem) ?? rule(base);
    if (parts && isValidParts(parts)) {
      return partsToDate(parts);
    }
  }
  return null;
}

export function parseRecordedOnFromFilename(filename: string): Date | null {
  if (!filename?.trim()) return null;
  return tryPatterns(filename);
}

function dateToRecordedOnString(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

/** Usa a data mais antiga detectada nos nomes. */
export function suggestRecordedOnFromFilenames(
  filenames: string[],
): string | null {
  const dates = filenames
    .map((n) => parseRecordedOnFromFilename(n))
    .filter((d): d is Date => d !== null);
  if (dates.length === 0) return null;
  const earliest = dates.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
  return dateToRecordedOnString(earliest);
}

/** Quando o cliente não envia `recordedOn`, tenta inferir pelos anexos. */
export function resolveRecordedOnWithFilenameFallback(
  recordedOn: string | undefined,
  filenames: string[],
): string | undefined {
  if ((recordedOn ?? '').trim()) {
    return recordedOn!.trim();
  }
  return suggestRecordedOnFromFilenames(filenames) ?? undefined;
}
