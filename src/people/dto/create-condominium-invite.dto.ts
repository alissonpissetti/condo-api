import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCondominiumInviteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groupingId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: 'morador@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description:
      'Obrigatório se ainda não existir ficha de pessoa com este email.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName?: string;
}
