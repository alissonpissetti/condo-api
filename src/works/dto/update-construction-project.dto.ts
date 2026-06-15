import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateConstructionProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: CONSTRUCTION_PROJECT_STATUSES })
  @IsOptional()
  @IsIn(CONSTRUCTION_PROJECT_STATUSES)
  status?: ConstructionProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startedOn?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedEndOn?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  completedOn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  supplierId?: string | null;
}
