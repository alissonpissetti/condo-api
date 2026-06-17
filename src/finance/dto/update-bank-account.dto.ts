import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateBankAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankName?: string | null;

  @ApiPropertyOptional({ description: 'Saldo inicial em centavos.' })
  @IsOptional()
  @IsInt()
  initialBalanceCents?: number;

  @ApiPropertyOptional({
    example: '2026-05-01',
    description: 'Data de referência do saldo inicial (AAAA-MM-DD).',
  })
  @IsOptional()
  @IsDateString()
  initialBalanceOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
