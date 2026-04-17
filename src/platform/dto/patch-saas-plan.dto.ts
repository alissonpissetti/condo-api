import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class PatchSaasPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  pricePerUnitCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'Texto público no site (catálogo). Uma linha por destaque.',
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  catalogBlurb?: string | null;

  @ApiPropertyOptional({
    type: [SaasPlanPriceTierDto],
    nullable: true,
    description:
      'Substituir faixas de preço, ou null para remover e voltar ao preço único (pricePerUnitCents).',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaasPlanPriceTierDto)
  unitPriceTiers?: SaasPlanPriceTierDto[] | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Mapa de módulos habilitados. Enviar `null` para limpar (plano sem restrição, todos liberados).',
  })
  @IsOptional()
  @IsObject()
  features?: Record<string, boolean> | null;
}
