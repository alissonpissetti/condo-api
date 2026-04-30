import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListPlanningPollsQueryDto {
  @ApiPropertyOptional({
    description:
      'Texto no título (case insensitive). Quando preenchido, ignora registeredFrom/registeredTo.',
    maxLength: 200,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    description:
      'Início do período de registro (AAAA-MM-DD, inclusive, UTC). Combinar com registeredTo; se ambos omitidos e sem q, usa últimos 30 dias.',
    example: '2026-03-01',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  registeredFrom?: string;

  @ApiPropertyOptional({
    description:
      'Fim do período de registro (AAAA-MM-DD, inclusive, UTC). Combinar com registeredFrom.',
    example: '2026-04-15',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  registeredTo?: string;

  @ApiPropertyOptional({
    description: 'Máximo de linhas (1–100).',
    minimum: 1,
    maximum: 100,
    default: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 100;

  @ApiPropertyOptional({
    description:
      'Quando `true`, cada pauta com votação passa a incluir `myVote` (voto da(s) unidade(s) do utilizador, se existir).',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeMyVotes?: boolean;
}
