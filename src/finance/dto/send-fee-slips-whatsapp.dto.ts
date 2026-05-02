import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class SendFeeSlipsWhatsappDto {
  @ApiProperty({ example: '2026-03' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'competenceYm deve ser AAAA-MM' })
  competenceYm: string;

  @ApiPropertyOptional({
    description:
      'Se omitido ou vazio, envia para todas as unidades com cobrança em aberto nesta competência. Caso contrário, só as unidades indicadas (devem ter cobrança em aberto).',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  unitIds?: string[];
}
