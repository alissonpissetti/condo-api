import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const unitPersonRoles = ['owner', 'responsible', 'both'] as const;
export type UnitPersonRole = (typeof unitPersonRoles)[number];

export class AssignUnitPersonDto {
  @ApiProperty({
    enum: unitPersonRoles,
    description:
      'owner = proprietário, responsible = responsável (ex. inquilino), both = ambos',
  })
  @IsEnum(unitPersonRoles)
  role: UnitPersonRole;

  @ApiPropertyOptional({ description: 'CPF (com ou sem máscara)' })
  @IsOptional()
  @IsString()
  cpf?: string;

  @ApiPropertyOptional({
    description:
      'Obrigatório se não existir pessoa/utilizador com o CPF/email indicado (convite)',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description:
      'Nome completo da pessoa (obrigatório para cadastro e boletos).',
    example: 'Maria Silva',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'CEP com 8 dígitos (pode usar a consulta GET /cep/:cep).',
    example: '01310100',
  })
  @IsString()
  @Matches(/^\d{8}$|^\d{5}-\d{3}$/, {
    message: 'CEP deve ter 8 dígitos (com ou sem hífen).',
  })
  addressZip: string;

  @ApiProperty({ example: 'Av. Paulista' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  addressStreet: string;

  @ApiProperty({ example: '1000' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  addressNumber: string;

  @ApiPropertyOptional({ example: 'Sala 12' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressComplement?: string;

  @ApiProperty({ example: 'Bela Vista' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  addressNeighborhood: string;

  @ApiProperty({ example: 'São Paulo' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  addressCity: string;

  @ApiProperty({ example: 'SP', description: 'UF com 2 letras' })
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'UF deve ter 2 letras.' })
  addressState: string;
}
