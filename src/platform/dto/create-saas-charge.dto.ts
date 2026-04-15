import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

export class CreateSaasChargeDto {
  @ApiProperty({ example: '2026-04', description: 'Mês de referência YYYY-MM' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'referenceMonth deve ser YYYY-MM',
  })
  referenceMonth: string;

  @ApiPropertyOptional({ description: 'Data de vencimento (ISO). Omite = +10 dias.' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
