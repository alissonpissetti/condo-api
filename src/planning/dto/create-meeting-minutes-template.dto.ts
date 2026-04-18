import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMeetingMinutesTemplateDto {
  @ApiProperty({
    example: 'Reunião ordinária — aprovação de pauta e encargos',
    description: 'Título que identifica a reunião (aparece no PDF e na lista).',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({
    example: '2026-05-12T19:30',
    description: 'Data e hora de referência (formato ISO ou datetime-local).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  meetingAt?: string;

  @ApiPropertyOptional({ example: 'Salão de festas / assembleia virtual' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  location?: string;

  @ApiPropertyOptional({
    description: 'Ordem do dia ou notas da pauta (texto livre).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  agendaNotes?: string;
}
