import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';
import type { AllocationRule } from '../allocation.types';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

export class CreateTransactionDto {
  @ApiProperty({ enum: ['expense', 'income', 'investment'] })
  @IsEnum(['expense', 'income', 'investment'])
  kind: 'expense' | 'income' | 'investment';

  @ApiProperty({ example: 150_00, description: 'Valor total em centavos' })
  @IsInt()
  @Min(1)
  amountCents: number;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  occurredOn: string;

  @ApiPropertyOptional({
    example: '2026-04-01',
    description:
      'Competência contábil (YYYY-MM-DD). Se omitir, usa-se a mesma data de ocorrência.',
  })
  @IsOptional()
  @IsDateString()
  competencyOn?: string;

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

  @ApiPropertyOptional({
    description:
      'Chave do documento (boleto/contrato/print) retornada por POST /condominiums/:id/transaction-receipts (opcional).',
  })
  @IsOptional()
  @IsString()
  @Matches(RECEIPT_KEY_RE, {
    message: 'documentStorageKey inválida',
  })
  documentStorageKey?: string;

  @ApiPropertyOptional({
    description:
      'Lista de documentos da transação (boleto/contrato/print), com chaves retornadas por upload.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(RECEIPT_KEY_RE, {
    each: true,
    message: 'documentStorageKeys contém chave inválida',
  })
  documentStorageKeys?: string[];

  @ApiPropertyOptional({
    description:
      'Chave do comprovante de pagamento retornada por POST /condominiums/:id/transaction-receipts (opcional).',
  })
  @IsOptional()
  @IsString()
  @Matches(RECEIPT_KEY_RE, {
    message: 'receiptStorageKey inválida',
  })
  receiptStorageKey?: string;

  @ApiProperty({
    description: 'Regra de rateio (none só para receita sem repartição)',
    example: { kind: 'all_units_equal' },
  })
  @IsObject()
  allocationRule: AllocationRule;

  @ApiPropertyOptional({
    description:
      'Opcional. Mesmo UUID em todas as parcelas de uma série recorrente (gerado no cliente).',
  })
  @IsOptional()
  @IsUUID()
  recurringSeriesId?: string;
}
