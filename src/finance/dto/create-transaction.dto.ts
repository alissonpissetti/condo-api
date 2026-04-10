import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateTransactionDto {
  @ApiProperty({ enum: ['expense', 'income'] })
  @IsEnum(['expense', 'income'])
  kind: 'expense' | 'income';

  @ApiProperty({ example: 150_00, description: 'Valor total em centavos' })
  @IsInt()
  @Min(1)
  amountCents: number;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  occurredOn: string;

  @ApiProperty({ example: 'Conta de luz abril' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  fundId?: string | null;

  @ApiProperty({
    description: 'Regra de rateio (none só para receita sem repartição)',
    example: { kind: 'all_units_equal' },
  })
  @IsObject()
  allocationRule: AllocationRule;
}
