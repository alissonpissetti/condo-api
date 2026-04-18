import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ConfirmReadDto {
  @ApiProperty({ description: 'Token recebido por e-mail (uso único).' })
  @IsString()
  @MinLength(16)
  token: string;
}
