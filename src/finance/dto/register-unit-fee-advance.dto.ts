import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

export class RegisterUnitFeeAdvanceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId: string;

  @ApiProperty({
    description: 'Valor do adiantamento em centavos (inteiro positivo).',
    example: 35000,
  })
  @IsInt()
  @Min(1)
  amountCents: number;

  @ApiProperty({
    description:
      'Justificativa do adiantamento (ex.: pagamento de contas do condomínio adiantado pelo síndico).',
    minLength: 8,
    maxLength: 4000,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  justification: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Conta bancária de origem/referência do adiantamento.',
  })
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @ApiPropertyOptional({
    description:
      'Comprovante já enviado (POST /transaction-receipts). Formato `receipts/{uuid}.{ext}`.',
  })
  @IsOptional()
  @IsString()
  @Matches(RECEIPT_KEY_RE, { message: 'paymentReceiptStorageKey inválida' })
  paymentReceiptStorageKey?: string;
}
