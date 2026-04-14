import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';
import type { AllocationRule } from '../allocation.types';

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreateFundDto {
  @ApiProperty({ example: 'Reforma hall' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({
    description:
      'Se true, fundo permanente (débito mensal contínuo). Padrão: false (parcelado).',
  })
  @IsOptional()
  @IsBoolean()
  isPermanent?: boolean;

  @ApiProperty({
    description: 'Mesma estrutura que em transações (sem kind "none").',
    example: { kind: 'all_units_equal' },
  })
  @IsObject()
  allocationRule: AllocationRule;

  @ApiPropertyOptional({
    description: 'Centavos — débito mensal por unidade (só permanente)',
  })
  @ValidateIf((o: CreateFundDto) => o.isPermanent === true)
  @IsInt()
  @Min(1)
  @Type(() => Number)
  permanentMonthlyDebitCents?: number;

  @ApiPropertyOptional({
    description: 'Centavos — total por unidade a arrecadar (só parcelado)',
  })
  @ValidateIf((o: CreateFundDto) => o.isPermanent !== true)
  @IsInt()
  @Min(1)
  @Type(() => Number)
  termTotalPerUnitCents?: number;

  @ApiPropertyOptional({
    description: 'Número de parcelas mensais (só parcelado)',
  })
  @ValidateIf((o: CreateFundDto) => o.isPermanent !== true)
  @IsInt()
  @Min(1)
  @Type(() => Number)
  termInstallmentCount?: number;

  @ApiPropertyOptional({
    description: 'Mês/ano da primeira mensalidade do parcelamento (AAAA-MM)',
  })
  @ValidateIf((o: CreateFundDto) => o.isPermanent !== true)
  @IsString()
  @Matches(YM, { message: 'termFirstMonthYm must be YYYY-MM' })
  termFirstMonthYm?: string;
}
