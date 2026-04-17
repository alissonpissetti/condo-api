import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

export class SettleFeeChargeDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Opcional. Se omitido, quita sem vincular transação de receita (use o comprovante em PDF).',
  })
  @IsOptional()
  @IsUUID()
  incomeTransactionId?: string;

  @ApiPropertyOptional({
    description:
      'Chave (relativa) do comprovante de pagamento já enviado para o storage de receipts (POST /transaction-receipts). Formato: `receipts/{uuid}.{pdf|png|jpg|jpeg|webp}`.',
    example: 'receipts/11111111-1111-4111-8111-111111111111.png',
  })
  @IsOptional()
  @IsString()
  @Matches(RECEIPT_KEY_RE, { message: 'paymentReceiptStorageKey inválida' })
  paymentReceiptStorageKey?: string;
}
