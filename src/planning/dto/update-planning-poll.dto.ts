import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
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
}
