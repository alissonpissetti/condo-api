import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InvitePreviewResponseDto {
  @ApiProperty({ enum: ['unit', 'condominium'] })
  inviteKind: 'unit' | 'condominium';

  @ApiProperty()
  condominiumName: string;

  @ApiPropertyOptional({
    description: 'Preenchido em convites de unidade (titular/responsável).',
  })
  unitIdentifier?: string;

  @ApiPropertyOptional({ description: 'E-mail parcialmente mascarado' })
  emailMasked: string | null;

  @ApiPropertyOptional({ description: 'Celular parcialmente mascarado' })
  phoneMasked: string | null;

  @ApiProperty({ example: ['proprietário'] })
  roles: string[];

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;

  @ApiProperty({ description: 'Se a conta ainda não foi criada' })
  pendingRegistration: boolean;
}
