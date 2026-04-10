import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFundDto {
  @ApiProperty({ example: 'Fundo de obras fachada' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isTemporary?: boolean;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}
