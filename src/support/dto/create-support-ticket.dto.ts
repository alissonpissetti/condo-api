import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SupportTicketCategory } from '../enums/support-ticket-category.enum';
import { SupportTicketTarget } from '../enums/support-ticket-target.enum';

export class CreateSupportTicketDto {
  @ApiProperty({
    enum: SupportTicketTarget,
    description:
      '`platform` = solicitação ao produto Meu Condomínio; `condominium` = solicitação à gestão do condomínio (exige condomínio).',
  })
  @IsEnum(SupportTicketTarget)
  target: SupportTicketTarget;

  @ApiPropertyOptional({
    description:
      'Condomínio: obrigatório se `target` = `condominium`; opcional se `target` = `platform` (contexto). O usuário precisa ter acesso. Com condomínio na plataforma, o síndico pode receber cópia por e-mail.',
  })
  @IsOptional()
  @IsUUID('4')
  condominiumId?: string;

  @ApiProperty({
    enum: SupportTicketCategory,
    description:
      'Categoria conforme o destino: use valores bug/correction/… para plataforma; condo_* para condomínio.',
  })
  @IsEnum(SupportTicketCategory)
  category: SupportTicketCategory;

  @ApiProperty({ maxLength: 512 })
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  title: string;

  @ApiProperty({
    description:
      'Descrição detalhada. Sem arquivos, use pelo menos 10 caracteres; com anexos na abertura, pode ser mais curta ou vazia (validação no serviço).',
  })
  @IsString()
  @MaxLength(50000)
  body: string;
}
