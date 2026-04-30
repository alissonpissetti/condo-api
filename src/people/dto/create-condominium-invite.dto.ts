import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCondominiumInviteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groupingId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId: string;

  @ApiPropertyOptional({ example: 'morador@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description:
      'Celular com DDD (Brasil). Pode ser usado sozinho (convite por WhatsApp via Twilio) ou com o e-mail (envia nos dois canais).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({
    description:
      'Obrigatório se ainda não existir ficha de pessoa com o contato indicado.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName?: string;
}
