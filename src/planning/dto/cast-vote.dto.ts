import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

export class CastVoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId: string;

  @ApiProperty({
    type: [String],
    description:
      'Identificadores das opções escolhidas. Uma entrada para escolha única; várias se a pauta permitir.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  optionIds: string[];
}
