import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MePersonDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  fullName: string;

  @ApiPropertyOptional({ description: '11 dígitos ou null' })
  cpf: string | null;

  @ApiPropertyOptional({
    description: 'Telefone na ficha (espelha o da conta ao salvar)',
  })
  phone: string | null;

  @ApiPropertyOptional()
  addressZip: string | null;

  @ApiPropertyOptional()
  addressStreet: string | null;

  @ApiPropertyOptional()
  addressNumber: string | null;

  @ApiPropertyOptional()
  addressComplement: string | null;

  @ApiPropertyOptional()
  addressNeighborhood: string | null;

  @ApiPropertyOptional()
  addressCity: string | null;

  @ApiPropertyOptional()
  addressState: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({
    description:
      'E.164 BR; null em contas antigas até atualizarem em Meus dados',
    example: '5561999988888',
  })
  phone: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({
    type: MePersonDto,
    nullable: true,
    description:
      'Ficha de pessoa associada à conta (nome, CPF, endereço). Null até completar o perfil.',
  })
  person: MePersonDto | null;
}
