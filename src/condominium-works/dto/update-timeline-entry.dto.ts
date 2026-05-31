import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Fornecedor do orçamento.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  supplierName?: string;
}
