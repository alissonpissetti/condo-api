import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import type { AllocationRule } from '../allocation.types';

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export class UpdateFundDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPermanent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  allocationRule?: AllocationRule;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  permanentMonthlyDebitCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  termTotalPerUnitCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  termInstallmentCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(YM, { message: 'termFirstMonthYm must be YYYY-MM' })
  termFirstMonthYm?: string;
}
