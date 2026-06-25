import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateMaintenanceTimelineEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string | null;

  @ApiPropertyOptional({
    description:
      'Data e hora do registro (YYYY-MM-DDTHH:mm, horário de São Paulo).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/)
  recordedOn?: string;
}
