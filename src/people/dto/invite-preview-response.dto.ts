import { ApiProperty } from '@nestjs/swagger';

export class InvitePreviewResponseDto {
  @ApiProperty()
  condominiumName: string;

  @ApiProperty()
  unitIdentifier: string;

  @ApiProperty({ description: 'Email parcialmente mascarado' })
  emailMasked: string;

  @ApiProperty({ example: ['proprietário'] })
  roles: string[];

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;

  @ApiProperty({ description: 'Se a conta ainda não foi criada' })
  pendingRegistration: boolean;
}
