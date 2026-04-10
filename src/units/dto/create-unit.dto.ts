import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: '101' })
  @IsString()
  @MinLength(1)
  identifier: string;

  @ApiPropertyOptional({ example: '1', nullable: true })
  @IsOptional()
  @IsString()
  floor?: string | null;

  @ApiPropertyOptional({ example: 'Frente mar', nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;
}
