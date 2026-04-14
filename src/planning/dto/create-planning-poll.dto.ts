import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
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

  @ApiProperty({ type: [PlanningPollOptionInputDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => PlanningPollOptionInputDto)
  options: PlanningPollOptionInputDto[];
}
