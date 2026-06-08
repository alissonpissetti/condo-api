import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class DecidePollDto {
  @ApiProperty({ format: 'uuid', description: 'Deliberação (item de votação).' })
  @IsUUID()
  questionId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  optionId: string;
}
