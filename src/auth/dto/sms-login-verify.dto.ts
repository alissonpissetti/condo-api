import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class SmsLoginVerifyDto {
  @ApiProperty({ example: '61999998888' })
  @IsString()
  @MinLength(10)
  @MaxLength(32)
  phone: string;

  @ApiProperty({ example: '123456', description: 'Código de 6 dígitos recebido por SMS' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}
