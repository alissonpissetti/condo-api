import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Conta de origem (saída do valor).',
  })
  @IsUUID()
  fromBankAccountId: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Conta de destino (entrada do valor).',
  })
  @IsUUID()
  toBankAccountId: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Fundo de origem (opcional). Reduz o saldo deste fundo.',
  })
  @IsOptional()
  @IsUUID()
  fromFundId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Fundo de destino (opcional). Aumenta o saldo deste fundo.',
  })
  @IsOptional()
  @IsUUID()
  toFundId?: string | null;

  @ApiProperty({ example: 10_000_00, description: 'Valor transferido em centavos' })
  @IsInt()
  @Min(1)
  amountCents: number;

  @ApiProperty({ example: '2026-05-15' })
  @IsDateString()
  occurredOn: string;

  @ApiPropertyOptional({
    example: 'Resgate investimento para conta corrente',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;
}

export class TransferCreateResultDto {
  transferGroupId: string;
  outTransaction: unknown;
  inTransaction: unknown;
}
