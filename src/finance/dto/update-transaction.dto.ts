import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import type { AllocationRule } from '../allocation.types';

export class UpdateTransactionDto {
  @ApiPropertyOptional({ enum: ['expense', 'income'] })
  @IsOptional()
  @IsEnum(['expense', 'income'])
  kind?: 'expense' | 'income';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  occurredOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  fundId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  allocationRule?: AllocationRule;
}
