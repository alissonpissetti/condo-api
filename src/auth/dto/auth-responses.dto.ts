import { ApiProperty } from '@nestjs/swagger';

export class AuthRegisterResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'owner@example.com' })
  email: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class AuthLoginResponseDto {
  @ApiProperty({
    description: 'JWT para enviar em Authorization: Bearer <token>',
  })
  access_token: string;
}

export class SmsLoginRequestAcceptedDto {
  @ApiProperty({ example: true })
  ok: true;

  @ApiProperty({
    example:
      'Se existir conta para este número, enviamos um código de acesso.',
  })
  message: string;
}

export class PasswordResetRequestAcceptedDto {
  @ApiProperty({ example: true })
  ok: true;

  @ApiProperty({
    example:
      'Se existir conta, enviamos um código por e-mail, WhatsApp ou SMS (conforme canal e configuração).',
  })
  message: string;
}

export class PasswordResetVerifyResponseDto {
  @ApiProperty({
    description:
      'Token de uso único (curta duração) para concluir a alteração de senha.',
  })
  reset_token: string;
}
