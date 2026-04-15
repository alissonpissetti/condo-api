import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSaasVoucherDto {
  @ApiProperty({ example: 'Promoção parceiros Q1' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name: string;

  @ApiProperty({
    example: 'PROMO2026',
    description: 'Único; armazenado em maiúsculas. Letras, números e hífen.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9\-]+$/, {
    message:
      'code só pode conter letras, números e hífen (sem espaços).',
  })
  code: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  validFrom: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  validTo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
