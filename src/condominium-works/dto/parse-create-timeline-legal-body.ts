import { BadRequestException } from '@nestjs/common';
import type { CreateTimelineNoteDto } from './create-timeline-note.dto';

export function parseCreateTimelineLegalBody(
  body: Record<string, unknown>,
): CreateTimelineNoteDto {
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  let recordedOn: string | undefined;
  if (typeof body.recordedOn === 'string' && body.recordedOn.trim()) {
    recordedOn = body.recordedOn.trim();
  }
  return { body: text, recordedOn };
}

export function assertLegalHasContent(
  dto: CreateTimelineNoteDto,
  fileCount: number,
): void {
  if (fileCount < 1) {
    throw new BadRequestException(
      'Envie o contrato ou documento assinado (PDF ou outro arquivo).',
    );
  }
}
