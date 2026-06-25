import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { AllocationRule } from '../../finance/allocation.types';
import { WorkStatus } from '../enums/work-status.enum';

export class UpdateWorkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: WorkStatus })
  @IsOptional()
  @IsEnum(WorkStatus)
  status?: WorkStatus;

  @ApiPropertyOptional({
    description: 'Critério de rateio para transações vinculadas à obra',
  })
  @IsOptional()
  @IsObject()
  allocationRule?: AllocationRule;
}
