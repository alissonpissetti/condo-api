import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssemblyType } from '../enums/assembly-type.enum';

export class PlanningPollOptionInputDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  label: string;
}

export class PlanningPollQuestionInputDto {
  @ApiProperty({
    description: 'Enunciado / assunto desta deliberação na pauta.',
  })
  @IsString()
  @MaxLength(512)
  title: string;

  @ApiPropertyOptional({
    description: 'Escolha múltipla nesta deliberação (por unidade).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @ApiProperty({ type: [PlanningPollOptionInputDto] })
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => PlanningPollOptionInputDto)
  options: PlanningPollOptionInputDto[];
}

export class CreatePlanningPollDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  title: string;

  @ApiPropertyOptional({
    description: 'HTML rico (sanitizado no servidor).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  body?: string;

  @ApiProperty()
  @IsDateString()
  opensAt: string;

  @ApiProperty()
  @IsDateString()
  closesAt: string;

  @ApiPropertyOptional({
    description:
      'Data civil de competência da pauta (AAAA-MM-DD). Omitir = data UTC do registro no servidor; o cliente costuma enviar o dia civil local.',
  })
  @IsOptional()
  @IsDateString()
  competenceDate?: string;

  @ApiProperty({ enum: AssemblyType })
  @IsEnum(AssemblyType)
  assemblyType: AssemblyType;

  @ApiPropertyOptional({
    description:
      'Legado: aplica-se à única deliberação quando «questions» não é enviado.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @ApiPropertyOptional({
    type: [PlanningPollQuestionInputDto],
    description:
      'Deliberações / votações desta pauta (mínimo 1 para ordinária ou eleição). Cada item tem enunciado e opções.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => PlanningPollQuestionInputDto)
  questions?: PlanningPollQuestionInputDto[];

  @ApiPropertyOptional({
    type: [PlanningPollOptionInputDto],
    description:
      'Legado: uma única deliberação com o título da pauta. Preferir «questions».',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => PlanningPollOptionInputDto)
  options?: PlanningPollOptionInputDto[];
}
