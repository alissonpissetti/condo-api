import { BadRequestException } from '@nestjs/common';
import { parseSaoPauloLocalDateTime } from '../../common/america-sao-paulo-time.util';

/** Data/hora do item na timeline; padrão = agora. */
export function resolveTimelineRecordedAt(recordedOn?: string): Date {
  const raw = (recordedOn ?? '').trim();
  if (!raw) {
    return new Date();
  }

  const localMatch =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (localMatch) {
    try {
      const at = parseSaoPauloLocalDateTime(raw);
      if (at.getTime() > Date.now()) {
        throw new BadRequestException(
          'A data e hora do registro não podem ser futuras.',
        );
      }
      return at;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException('Data e hora do registro inválidas.');
    }
  }

  const ymd = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    try {
      const at = parseSaoPauloLocalDateTime(`${ymd}T12:00:00`);
      if (at.getTime() > Date.now()) {
        throw new BadRequestException(
          'A data e hora do registro não podem ser futuras.',
        );
      }
      return at;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException('Data e hora do registro inválidas.');
    }
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
