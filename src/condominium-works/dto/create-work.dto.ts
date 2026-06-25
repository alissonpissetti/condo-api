import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateWorkDto {
  @ApiProperty({ example: 'Reforma do hall' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: WorkStatus, default: WorkStatus.Planned })
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
