import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class PasswordResetCompleteDto {
  @ApiProperty({
    description: 'Token devolvido por POST /auth/password-reset/verify',
  })
  @IsString()
  @MinLength(20)
  reset_token: string;

  @ApiProperty({ example: 'novaSenhaSegura1', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
