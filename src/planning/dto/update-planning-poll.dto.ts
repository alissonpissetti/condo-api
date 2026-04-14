import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PlanningPollStatus } from '../enums/planning-poll-status.enum';

export class UpdatePlanningPollDto {
  @ApiPropertyOptional({ enum: PlanningPollStatus })
  @IsOptional()
  @IsEnum(PlanningPollStatus)
  status?: PlanningPollStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  decidedOptionId?: string | null;

  @ApiPropertyOptional({ description: 'Apenas em rascunho.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  @ApiPropertyOptional({
    description: 'HTML rico; editável em rascunho ou pauta aberta.',
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
}
