import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SupportTicketCategory } from '../enums/support-ticket-category.enum';

export class CreateSupportTicketDto {
  @ApiPropertyOptional({
    description: 'Condomínio relacionado (opcional). O utilizador tem de ter acesso.',
  })
  @IsOptional()
  @IsUUID('4')
  condominiumId?: string;

  @ApiProperty({ enum: SupportTicketCategory })
  @IsEnum(SupportTicketCategory)
  category: SupportTicketCategory;

  @ApiProperty({ maxLength: 512 })
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  title: string;

  @ApiProperty({ description: 'Descrição detalhada (passos, URL, capturas referidas no texto, etc.)' })
  @IsString()
  @MinLength(10)
  @MaxLength(50000)
  body: string;
}
