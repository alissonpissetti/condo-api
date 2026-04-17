import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SaasPlanPriceTierDto } from './saas-plan-price-tier.dto';

export class CreateSaasPlanDto {
  @ApiProperty({ example: 'Essencial' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name: string;

  @ApiProperty({ example: 500, description: 'Centavos por unidade / mês' })
  @IsInt()
  @Min(0)
  pricePerUnitCents: number;

  @ApiPropertyOptional({ example: 'BRL' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    description:
      'Texto para o catálogo público (site). Uma linha por destaque; opcional.',
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  catalogBlurb?: string | null;

  @ApiPropertyOptional({
    type: [SaasPlanPriceTierDto],
    description:
      'Opcional. Faixas de preço por total de unidades (contíguas a partir de 1; última com maxUnits null). Se preenchido, o preço da primeira faixa substitui o significado isolado de pricePerUnitCents no faturamento.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaasPlanPriceTierDto)
  unitPriceTiers?: SaasPlanPriceTierDto[] | null;

  @ApiPropertyOptional({
    description:
      'Mapa de módulos habilitados no painel para este plano (ex.: { editCondominium: true, documents: false }). Chaves não listadas ficam habilitadas por padrão. Quando ausente, o plano não restringe o acesso.',
    example: {
      editCondominium: true,
      units: true,
      invitations: true,
      members: true,
      unitShortcuts: true,
      financialTransactions: true,
      financialStatement: true,
      funds: true,
      condoFees: true,
      planning: true,
      documents: true,
    },
  })
  @IsOptional()
  @IsObject()
  features?: Record<string, boolean> | null;
}
