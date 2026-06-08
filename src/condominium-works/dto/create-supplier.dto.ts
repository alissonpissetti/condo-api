import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Construtora ABC', description: 'Nome da empresa' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'João Silva', description: 'Pessoa de contato na empresa' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactName?: string | null;

  @ApiPropertyOptional({ example: '(11) 98765-4321' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'cnpj@email.com ou +5511999999999' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  pixKey?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({
    description: 'Cria categoria do condomínio e vincula ao fornecedor',
    example: 'Impermeabilização',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  newCategoryName?: string | null;
}
