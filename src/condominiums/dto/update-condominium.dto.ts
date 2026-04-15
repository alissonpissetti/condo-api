import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateCondominiumDto {
  @ApiPropertyOptional({ example: 'Residencial Alpha (renomeado)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    description: 'Novo plano SaaS (mensalidade por unidade) para este condomínio.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  planId?: number;
}
