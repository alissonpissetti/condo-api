import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Dados da ficha `people` — omitir o objeto inteiro para não alterar nome/CPF/endereço. */
export class UpdateMePersonDto {
  @ApiPropertyOptional({ example: 'Maria Silva' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName?: string;

  @ApiPropertyOptional({
    description: 'CPF só dígitos (11) ou vazio para limpar',
  })
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string;

  @ApiPropertyOptional({ example: '01310100' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  addressZip?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressStreet?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  addressNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressComplement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressNeighborhood?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  addressCity?: string;

  @ApiPropertyOptional({ description: 'UF, 2 letras' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  addressState?: string;
}
