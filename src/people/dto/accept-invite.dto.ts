import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ example: 'password12', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    description: 'Nome completo (atualiza a ficha da pessoa)',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;
}
