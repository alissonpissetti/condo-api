import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCondominiumDto {
  @ApiPropertyOptional({ example: 'Residencial Alpha (renomeado)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
