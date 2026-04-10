import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUnitDto {
  @ApiPropertyOptional({ example: '101-A' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  identifier?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  floor?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}
