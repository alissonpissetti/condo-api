import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
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

  @ApiProperty({ type: [PlanningPollOptionInputDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => PlanningPollOptionInputDto)
  options: PlanningPollOptionInputDto[];
}
