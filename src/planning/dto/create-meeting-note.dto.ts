import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMeetingNoteDto {
  @ApiProperty({
    description: 'Anotação pura da reunião (texto livre, votos, deliberações, etc.).',
    maxLength: 4000,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  text: string;
}
