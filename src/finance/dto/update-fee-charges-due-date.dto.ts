import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

const DATE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateFeeChargesDueDateDto {
  @ApiProperty({
    description:
      'IDs das cobranças condominiais (UUIDs) cuja data de vencimento será alterada.',
    type: [String],
    example: [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  chargeIds!: string[];

  @ApiProperty({
    description: 'Nova data de vencimento (AAAA-MM-DD).',
    example: '2026-04-15',
  })
  @IsString()
  @Matches(DATE_YMD_RE, {
    message: 'dueOn deve estar no formato AAAA-MM-DD',
  })
  dueOn!: string;
}
