import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
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
