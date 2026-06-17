import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AssemblyType } from '../enums/assembly-type.enum';

export class AiDraftPollDto {
  @ApiProperty({
    description:
      'Descrição livre do assunto da pauta (o que será deliberado, contexto, valores, etc.).',
    example:
      'Aprovar contratação de nova empresa de limpeza, orçamento de R$ 4.200/mês.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  brief: string;

  @ApiPropertyOptional({
    enum: AssemblyType,
    description:
      'Tipo de assembleia desejado. Se omitido, a IA infere a partir do texto.',
  })
  @IsOptional()
  @IsEnum(AssemblyType)
  assemblyType?: AssemblyType;
}

export class AiDraftPollQuestionResultDto {
  @ApiProperty()
  title: string;

  @ApiProperty()
  allowMultiple: boolean;

  @ApiProperty({ type: [String] })
  options: string[];
}

export class AiDraftPollResultDto {
  @ApiProperty()
  title: string;

  @ApiPropertyOptional({
    description: 'HTML sanitizado para o editor de descrição da pauta.',
  })
  body: string | null;

  @ApiProperty({ enum: AssemblyType })
  assemblyType: AssemblyType;

  @ApiProperty({
    type: [AiDraftPollQuestionResultDto],
    description: 'Deliberações / votações desta pauta. Vazio para tipo «Ata».',
  })
  questions: AiDraftPollQuestionResultDto[];
}
