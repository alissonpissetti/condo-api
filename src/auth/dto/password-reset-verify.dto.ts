import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class PasswordResetVerifyDto {
  @ApiProperty({ enum: ['email', 'sms', 'whatsapp'], example: 'email' })
  @IsIn(['email', 'sms', 'whatsapp'])
  channel: 'email' | 'sms' | 'whatsapp';

  @ApiPropertyOptional({ example: 'owner@example.com' })
  @ValidateIf((o) => o.channel === 'email')
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '61999998888' })
  @ValidateIf((o) => o.channel === 'sms' || o.channel === 'whatsapp')
  @IsString()
  @MinLength(10)
  @MaxLength(32)
  phone?: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
