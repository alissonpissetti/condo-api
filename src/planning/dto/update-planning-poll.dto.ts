import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AssemblyType } from '../enums/assembly-type.enum';
import { PlanningPollStatus } from '../enums/planning-poll-status.enum';
import { PlanningPollOptionInputDto } from './create-planning-poll.dto';

export class UpdatePlanningPollDto {
  @ApiPropertyOptional({ enum: PlanningPollStatus })
  @IsOptional()
  @IsEnum(PlanningPollStatus)
  status?: PlanningPollStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  decidedOptionId?: string | null;

  @ApiPropertyOptional({
    description:
      'Editável em rascunho, votação aberta ou encerrada (antes da decisão final).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  @ApiPropertyOptional({
    description:
      'HTML rico; o síndico ou titular pode editar em qualquer estado (rascunho, aberta, encerrada ou após decisão registrada).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @ApiPropertyOptional({
    description:
      'Data civil de competência (AAAA-MM-DD). Editável em rascunho, votação aberta, encerrada ou após decisão registrada.',
  })
  @IsOptional()
  @IsDateString()
  competenceDate?: string;

  @ApiPropertyOptional({ enum: AssemblyType, description: 'Apenas em rascunho.' })
  @IsOptional()
  @IsEnum(AssemblyType)
  assemblyType?: AssemblyType;

  @ApiPropertyOptional({ description: 'Apenas em rascunho.' })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @ApiPropertyOptional({
    type: [PlanningPollOptionInputDto],
    description:
      'Substitui todas as opções (rascunho). Obrigatório ao sair do tipo «Ata» para ordinária ou eleição. Omitir em tipo «Ata».',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => PlanningPollOptionInputDto)
  options?: PlanningPollOptionInputDto[];
}
