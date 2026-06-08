import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AiMergeMeetingMinutesDto {
  @ApiProperty({
    description:
      'Anotação solta digitada durante a reunião (será formatada e mesclada ao rascunho).',
    example: 'Aprovada a obra da água por unanimidade. Síndico vai assinar contrato.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  note: string;

  @ApiPropertyOptional({
    description: 'HTML actual do rascunho da ata no editor (pode estar vazio).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120_000)
  currentBodyHtml?: string;
}

export class AiMergeMeetingMinutesVoteResultDto {
  @ApiProperty({ example: '101' })
  unitIdentifier: string;

  @ApiProperty()
  ok: boolean;

  @ApiPropertyOptional()
  message?: string;
}

export class AiMergeMeetingMinutesResultDto {
  @ApiProperty({ description: 'HTML sanitizado do rascunho da ata após mesclar a nota.' })
  body: string;

  @ApiPropertyOptional({
    description:
      'Resultado da execução de votos extraídos da anotação (síndico/titular).',
    type: [AiMergeMeetingMinutesVoteResultDto],
  })
  votesApplied?: AiMergeMeetingMinutesVoteResultDto[];
}
