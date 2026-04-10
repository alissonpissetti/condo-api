import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateGroupingDto {
  @ApiProperty({ example: 'Bloco A' })
  @IsString()
  @MinLength(1)
  name: string;
}
