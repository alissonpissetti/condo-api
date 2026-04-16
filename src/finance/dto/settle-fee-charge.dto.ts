import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class SettleFeeChargeDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Opcional. Se omitido, quita sem vincular transação de receita (use o comprovante em PDF).',
  })
  @IsOptional()
  @IsUUID()
  incomeTransactionId?: string;
}
