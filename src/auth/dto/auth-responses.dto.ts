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
      'Se existir conta para este número, enviamos um código por SMS.',
  })
  message: string;
}
