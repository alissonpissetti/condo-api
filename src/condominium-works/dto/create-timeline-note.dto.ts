import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateTimelineNoteDto {
  @ApiPropertyOptional({ description: 'Texto do comentário (opcional se houver anexos)' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({
    description:
      'Data e hora do registro (YYYY-MM-DDTHH:mm). Padrão: agora.',
    example: '2025-03-15T14:30',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/)
  recordedOn?: string;
}
