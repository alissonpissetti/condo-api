import { ApiPropertyOptional } from '@nestjs/swagger';
import {
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

export class UpdateRecurringSeriesDto {
  @ApiPropertyOptional({ enum: ['expense', 'income', 'investment'] })
  @IsOptional()
  @IsEnum(['expense', 'income', 'investment'])
  kind?: 'expense' | 'income' | 'investment';

  @ApiPropertyOptional({
    description:
      'Título base; a API reaplica o sufixo (1/N)…(N/N) na ordem das datas.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  titleBase?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  fundId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  allocationRule?: AllocationRule;

  @ApiPropertyOptional({
    description:
      'Se informado, todas as parcelas passam a ter este valor (recalcula rateio).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Nova chave de comprovante para todas as parcelas; null remove de todas.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @Matches(RECEIPT_KEY_RE, { message: 'receiptStorageKey inválida' })
  receiptStorageKey?: string | null;
}
