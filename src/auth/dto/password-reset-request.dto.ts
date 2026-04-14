import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class PasswordResetRequestDto {
  @ApiProperty({ enum: ['email', 'sms'], example: 'email' })
  @IsIn(['email', 'sms'])
  channel: 'email' | 'sms';

  @ApiPropertyOptional({ example: 'owner@example.com' })
  @ValidateIf((o) => o.channel === 'email')
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '61999998888' })
  @ValidateIf((o) => o.channel === 'sms')
  @IsString()
  @MinLength(10)
  @MaxLength(32)
  phone?: string;
}
