import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateMeetingMinutesDto {
  @ApiPropertyOptional({
    description:
      'HTML atual da ata (opcional). A IA usa como referência, mas reescreve com base em todo o contexto.',
    maxLength: 100000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  currentBodyHtml?: string;
}
