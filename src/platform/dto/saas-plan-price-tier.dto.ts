import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class SaasPlanPriceTierDto {
  @ApiProperty({ example: 1, description: 'Início da faixa (unidades), inclusivo' })
  @IsInt()
  @Min(1)
  minUnits: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Fim da faixa inclusivo. Omitir ou null só na última entrada (= sem limite superior).',
    example: 20,
  })
  @IsOptional()
  @ValidateIf((o: SaasPlanPriceTierDto) => o.maxUnits != null)
  @IsInt()
  @Min(1)
  maxUnits?: number | null;

  @ApiProperty({ example: 800, description: 'Centavos por unidade / mês nesta faixa' })
  @IsInt()
  @Min(0)
  pricePerUnitCents: number;
}
