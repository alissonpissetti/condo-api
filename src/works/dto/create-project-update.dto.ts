import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

export class CreateProjectUpdateDto {
  @ApiProperty({ example: '2026-05-09' })
  @IsDateString()
  occurredOn: string;

  @ApiProperty({ example: 'Concretagem do piso térreo concluída.' })
  @IsString()
  @MinLength(1)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Chaves retornadas por POST /condominiums/:id/transaction-receipts (PDF ou imagem).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(RECEIPT_KEY_RE, {
    each: true,
    message: 'attachmentStorageKeys contém chave inválida',
  })
  attachmentStorageKeys?: string[];
}
