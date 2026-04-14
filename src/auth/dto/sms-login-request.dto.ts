import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SmsLoginRequestDto {
  @ApiProperty({
    description:
      'Celular com DDD (Brasil). Ex.: 61999998888 ou +55 61 99999-8888',
    example: '61999998888',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(32)
  phone: string;
}
