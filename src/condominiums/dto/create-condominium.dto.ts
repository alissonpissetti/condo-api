import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateCondominiumDto {
  @ApiProperty({ example: 'Residencial Alpha' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({
    description:
      'ID do plano SaaS (catálogo GET /saas-plans/catalog). Omitir = plano padrão da plataforma.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  planId?: number;
}
