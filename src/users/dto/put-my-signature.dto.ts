import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class PutMySignatureDto {
  @ApiProperty({
    description:
      'Imagem PNG em Base64 (pode incluir o prefixo data:image/png;base64,). Gerada no cliente a partir do desenho com rato ou toque.',
    example: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  })
  @IsString()
  @MinLength(40)
  @MaxLength(600_000)
  pngBase64: string;
}
