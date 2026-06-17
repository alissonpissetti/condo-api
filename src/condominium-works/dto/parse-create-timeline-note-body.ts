import { BadRequestException } from '@nestjs/common';
import type { CreateTimelineNoteDto } from './create-timeline-note.dto';

export function parseCreateTimelineNoteBody(
  body: Record<string, unknown>,
): CreateTimelineNoteDto {
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  let recordedOn: string | undefined;
  if (typeof body.recordedOn === 'string' && body.recordedOn.trim()) {
    recordedOn = body.recordedOn.trim();
  }
  return { body: text, recordedOn };
}

export function assertNoteHasContent(
  dto: CreateTimelineNoteDto,
  fileCount: number,
): void {
  if (!dto.body && fileCount < 1) {
    throw new BadRequestException(
      'Informe um texto ou envie ao menos um anexo.',
    );
  }
}
