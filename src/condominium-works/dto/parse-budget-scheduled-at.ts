import { BadRequestException } from '@nestjs/common';
import { parseSaoPauloLocalDateTime } from '../../common/america-sao-paulo-time.util';

/** Data/hora de agendamento (visita do fornecedor); opcional, pode ser futura. */
export function resolveBudgetScheduledAt(raw?: string): Date | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const localMatch =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (localMatch) {
    try {
      return parseSaoPauloLocalDateTime(trimmed);
    } catch {
      throw new BadRequestException('Data e hora do agendamento inválidas.');
    }
  }

  const ymd = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    try {
      return parseSaoPauloLocalDateTime(`${ymd}T12:00:00`);
    } catch {
      throw new BadRequestException('Data e hora do agendamento inválidas.');
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  throw new BadRequestException('Data e hora do agendamento inválidas.');
}
