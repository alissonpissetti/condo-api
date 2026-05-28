import { BadRequestException } from '@nestjs/common';

/** Data/hora do item na timeline; padrão = agora. */
export function resolveTimelineRecordedAt(recordedOn?: string): Date {
  const raw = (recordedOn ?? '').trim();
  if (!raw) {
    return new Date();
  }

  const localMatch =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (localMatch) {
    const y = Number.parseInt(localMatch[1], 10);
    const mo = Number.parseInt(localMatch[2], 10) - 1;
    const d = Number.parseInt(localMatch[3], 10);
    const h = Number.parseInt(localMatch[4], 10);
    const mi = Number.parseInt(localMatch[5], 10);
    const s = localMatch[6] ? Number.parseInt(localMatch[6], 10) : 0;
    const at = new Date(y, mo, d, h, mi, s, 0);
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException('Data e hora do registro inválidas.');
    }
    if (at.getTime() > Date.now()) {
      throw new BadRequestException(
        'A data e hora do registro não podem ser futuras.',
      );
    }
    return at;
  }

  const ymd = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)!;
    const at = new Date(
      Number.parseInt(m[1], 10),
      Number.parseInt(m[2], 10) - 1,
      Number.parseInt(m[3], 10),
      12,
      0,
      0,
      0,
    );
    if (at.getTime() > Date.now()) {
      throw new BadRequestException(
        'A data e hora do registro não podem ser futuras.',
      );
    }
    return at;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    if (parsed.getTime() > Date.now()) {
      throw new BadRequestException(
        'A data e hora do registro não podem ser futuras.',
      );
    }
    return parsed;
  }

  throw new BadRequestException('Data e hora do registro inválidas.');
}

/** Extrai data/hora de campo multipart ou JSON. */
export function readRecordedOnField(
  body: Record<string, unknown>,
): string | undefined {
  const v = body['recordedOn'];
  if (typeof v !== 'string' || !v.trim()) {
    return undefined;
  }
  return v.trim();
}
