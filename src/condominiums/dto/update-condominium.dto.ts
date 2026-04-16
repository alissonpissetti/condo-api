import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

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
      'WhatsApp para comprovantes (ex.: 41 99989-7602). Vazio = usar telefone da ficha do síndico.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  syndicWhatsappForReceipts?: string;
}
