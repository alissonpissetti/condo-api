import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateCondominiumDto {
  @ApiProperty({ example: 'Residencial Alpha' })
  @IsString()
  @MinLength(1)
  name: string;
}
