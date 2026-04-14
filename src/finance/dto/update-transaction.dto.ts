import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { AllocationRule } from '../allocation.types';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

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

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nova chave de upload; use null para remover o comprovante.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @Matches(RECEIPT_KEY_RE, { message: 'receiptStorageKey inválida' })
  receiptStorageKey?: string | null;
}
