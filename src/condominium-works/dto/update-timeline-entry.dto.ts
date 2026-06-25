import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { WorkBudgetStatus } from '../enums/work-budget-status.enum';

export class UpdateTimelineEntryDto {
  @ApiPropertyOptional({
    description: 'Texto do comentário ou título/descrição do registro jurídico.',
  })
  @IsOptional()
  @IsString()
  body?: string | null;

  @ApiPropertyOptional({
    description:
      'Data e hora do registro (YYYY-MM-DDTHH:mm, horário de São Paulo).',
    example: '2025-03-15T14:30',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/)
  recordedOn?: string;

  @ApiPropertyOptional({ description: 'Valor do orçamento em centavos.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  supplierId?: string | null;

  @ApiPropertyOptional({ description: 'Fornecedor do orçamento (texto livre).' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  supplierName?: string;

  @ApiPropertyOptional({
    description: 'O que o orçamento cobre (ex.: mão de obra, materiais).',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @ApiPropertyOptional({
    description:
      'Agendamento da visita (YYYY-MM-DDTHH:mm, horário de São Paulo).',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/)
  scheduledAt?: string | null;

  @ApiPropertyOptional({ enum: WorkBudgetStatus })
  @IsOptional()
  @IsEnum(WorkBudgetStatus)
  status?: WorkBudgetStatus;
}
