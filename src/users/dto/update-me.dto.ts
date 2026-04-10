import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { UpdateMePersonDto } from './update-me-person.dto';

export class UpdateMeDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Celular BR com DDD (será normalizado, ex.: 5561999988888)',
    example: '61999998888',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(32)
  phone: string;

  @ApiPropertyOptional({
    description: 'Obrigatório se enviar nova senha.',
    minLength: 1,
  })
  @ValidateIf((o) => !!o.newPassword?.trim())
  @IsString()
  @MinLength(1)
  currentPassword?: string;

  @ApiPropertyOptional({
    description: 'Nova senha (mín. 8). Omitir para não alterar.',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;

  @ApiPropertyOptional({
    type: UpdateMePersonDto,
    description:
      'Omitir para não alterar ficha de pessoa. Incluir para criar/atualizar nome, CPF e endereço.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateMePersonDto)
  person?: UpdateMePersonDto;
}
