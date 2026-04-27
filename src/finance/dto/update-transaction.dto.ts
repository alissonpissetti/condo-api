import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
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
  @ApiPropertyOptional({ enum: ['expense', 'income', 'investment'] })
  @IsOptional()
  @IsEnum(['expense', 'income', 'investment'])
  kind?: 'expense' | 'income' | 'investment';

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
    description: 'Nova chave de documento; use null para remover o documento.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @Matches(RECEIPT_KEY_RE, { message: 'documentStorageKey inválida' })
  documentStorageKey?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Lista completa de documentos da transação; []/null remove todos os documentos.',
    type: [String],
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(RECEIPT_KEY_RE, {
    each: true,
    message: 'documentStorageKeys contém chave inválida',
  })
  documentStorageKeys?: string[] | null;

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
