import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class PreviewBankAccountBalanceQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Conta existente (movimentos desta conta entram na prévia). Omitir ao cadastrar conta nova.',
  })
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @ApiProperty({
    description: 'Saldo inicial em centavos (pode ser negativo).',
    example: 1_122_203,
  })
  @Type(() => Number)
  @IsInt()
  initialBalanceCents: number;

  @ApiProperty({
    example: '2026-05-01',
    description: 'Data de referência do saldo inicial.',
  })
  @IsDateString()
  initialBalanceOn: string;

  @ApiPropertyOptional({
    example: '2026-05-30',
    description:
      'Data até a qual projetar (padrão: hoje). Retorna saldo ao fim deste dia.',
  })
  @IsOptional()
  @IsDateString()
  asOf?: string;
}

export type BankAccountBalancePreview = {
  asOf: string;
  initialBalanceOn: string;
  initialBalanceCents: string;
  movementsDeltaCents: string;
  projectedBalanceCents: string;
  transactionCount: number;
};
