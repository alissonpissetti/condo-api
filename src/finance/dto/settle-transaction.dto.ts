import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

export class SettleTransactionDto {
  @ApiPropertyOptional({
    description:
      'Chave do comprovante (upload prévio em POST …/transaction-receipts), opcional.',
  })
  @IsOptional()
  @IsString()
  @Matches(RECEIPT_KEY_RE, {
    message: 'receiptStorageKey inválida',
  })
  receiptStorageKey?: string;
}
