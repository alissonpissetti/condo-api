import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

export class UpdateProjectUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  occurredOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @ApiPropertyOptional({
    nullable: true,
    type: [String],
    description: 'Lista completa de anexos; null ou [] remove todos.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(RECEIPT_KEY_RE, {
    each: true,
    message: 'attachmentStorageKeys contém chave inválida',
  })
  attachmentStorageKeys?: string[] | null;
}
