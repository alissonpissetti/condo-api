import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchUnitPersonPhoneDto {
  @ApiPropertyOptional({
    description:
      'Telefone (celular BR recomendado). Vazio remove o número da ficha e da conta, se houver.',
    example: '41999887766',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
