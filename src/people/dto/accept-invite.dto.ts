import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({
    example: '(61) 99999-8888',
    description:
      'Celular com DDD (obrigatório). Usado na conta e para contato (ex.: WhatsApp).',
  })
  @IsNotEmpty()
  @IsString()
  phone: string;

  /** Obrigatório na API quando o convite exige criação de conta (`pendingRegistration: true` na pré-visualização). */
  @ApiPropertyOptional({ example: 'password12', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    description: 'Nome completo (atualiza a ficha da pessoa)',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;
}
