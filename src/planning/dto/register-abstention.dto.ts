import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RegisterAbstentionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ format: 'uuid', description: 'Deliberação em que a unidade se abstém.' })
  @IsUUID()
  questionId: string;
}
