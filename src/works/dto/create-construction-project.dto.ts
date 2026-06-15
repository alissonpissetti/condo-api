import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CONSTRUCTION_PROJECT_STATUSES,
  type ConstructionProjectStatus,
} from '../construction-project-status';

export class CreateConstructionProjectDto {
  @ApiProperty({ example: 'Reforma da fachada' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ enum: CONSTRUCTION_PROJECT_STATUSES })
  @IsIn(CONSTRUCTION_PROJECT_STATUSES)
  status: ConstructionProjectStatus;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsOptional()
  @IsDateString()
  startedOn?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  expectedEndOn?: string | null;

  @ApiPropertyOptional({ example: '2026-11-15' })
  @IsOptional()
  @IsDateString()
  completedOn?: string | null;

  @ApiPropertyOptional({ description: 'Fornecedor executante (cadastro em Fornecedores).' })
  @IsOptional()
  @IsUUID()
  supplierId?: string | null;
}
