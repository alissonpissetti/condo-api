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
    description: 'Se verdadeiro, cada unidade pode assinalar várias opções.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @ApiProperty({
    type: [PlanningPollOptionInputDto],
    description:
      'Obrigatório para assembleia ordinária ou eleição (mínimo 2). Omitir ou enviar vazio para tipo «Ata» (sem votação).',
  })
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => PlanningPollOptionInputDto)
  options: PlanningPollOptionInputDto[];
}
