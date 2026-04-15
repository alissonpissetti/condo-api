import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class PatchCondominiumVoucherDto {
  @ApiPropertyOptional({
    description:
      'Código do catálogo (maiúsculas/minúsculas ignoradas). Envie null ou "" para remover.',
    nullable: true,
    example: 'PROMO2026',
  })
  @ValidateIf(
    (o: PatchCondominiumVoucherDto) =>
      o.code !== null && o.code !== undefined,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9\-]+$/, {
    message:
      'code só pode conter letras, números e hífen (sem espaços).',
  })
  code?: string | null;
}
