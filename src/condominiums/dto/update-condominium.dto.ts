import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Lista de modelos de cobrança suportados. Por enquanto só `manual_pix`;
 * mantido como array para facilitar adição de novos modelos no futuro.
 */
export const BILLING_CHARGE_MODELS = ['manual_pix'] as const;
export type BillingChargeModel = (typeof BILLING_CHARGE_MODELS)[number];

export class UpdateCondominiumDto {
  @ApiPropertyOptional({ example: 'Residencial Alpha (renomeado)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    description: 'Novo plano SaaS (mensalidade por unidade) para este condomínio.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  planId?: number;

  @ApiPropertyOptional({
    description: 'Chave PIX do condomínio (e-mail, CPF/CNPJ, telefone ou EVP).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  billingPixKey?: string;

  @ApiPropertyOptional({
    description: 'Nome do beneficiário PIX (até 25 caracteres).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(25)
  billingPixBeneficiaryName?: string;

  @ApiPropertyOptional({
    description: 'Cidade do beneficiário PIX (até 15 caracteres).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  billingPixCity?: string;

  @ApiPropertyOptional({
    description:
      'Incluir no PDF de transparência o QR Code PIX e o código BR «Copia e cola». Se false, mantém só a chave em texto.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  transparencyPdfIncludePixQrCode?: boolean;

  @ApiPropertyOptional({
    description:
      'WhatsApp para comprovantes (ex.: 41 99989-7602). Vazio = usar telefone da ficha do síndico.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  syndicWhatsappForReceipts?: string;

  @ApiPropertyOptional({
    description:
      'Modelo de cobrança do condomínio. Atualmente só `manual_pix` (pagamento manual via PIX com envio de comprovante).',
    enum: BILLING_CHARGE_MODELS,
    example: 'manual_pix',
  })
  @IsOptional()
  @IsString()
  @IsIn(BILLING_CHARGE_MODELS as unknown as string[])
  billingChargeModel?: BillingChargeModel;

  @ApiPropertyOptional({
    description: 'Dia do mês (1..31) sugerido como vencimento padrão da taxa.',
    minimum: 1,
    maximum: 31,
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  billingDefaultDueDay?: number;

  @ApiPropertyOptional({
    description:
      'Juros aplicados em atraso, em basis points (1 bp = 0,01 %). Ex.: 250 = 2,50 %. Máximo 9999 (99,99 %).',
    minimum: 0,
    maximum: 9999,
    example: 200,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  billingLateInterestBps?: number;
}
