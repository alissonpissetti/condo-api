import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateGroupingDto {
  @ApiPropertyOptional({ example: 'Bloco A — renovado' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
