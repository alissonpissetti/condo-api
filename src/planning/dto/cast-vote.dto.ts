import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CastVoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  optionId: string;
}
