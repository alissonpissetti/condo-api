import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

export class ReplaceFeeChargeReceiptDto {
  @ApiProperty({
    description:
      'Nova chave do ficheiro já enviado (POST /condominiums/:id/transaction-receipts). Usa o mesmo armazenamento que os comprovantes (local ou Nextcloud).',
    example: 'receipts/11111111-1111-4111-8111-111111111111.pdf',
  })
  @IsString()
  @Matches(RECEIPT_KEY_RE, { message: 'paymentReceiptStorageKey inválida' })
  paymentReceiptStorageKey: string;
}
