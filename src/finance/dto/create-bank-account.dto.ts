import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({ example: 'Conta corrente principal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Itaú' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankName?: string;

  @ApiProperty({
    description: 'Saldo inicial em centavos (pode ser negativo).',
    example: 150000,
  })
  @IsInt()
  initialBalanceCents: number;

  @ApiProperty({
    example: '2026-05-01',
    description:
      'Data em que o saldo inicial foi conferido. Lançamentos com data anterior não alteram o saldo desta conta.',
  })
  @IsDateString()
  initialBalanceOn: string;
}
