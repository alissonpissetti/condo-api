import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { WorkBudgetStatus } from '../enums/work-budget-status.enum';

export class UpdateWorkBudgetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  supplierName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validUntil?: string | null;

  @ApiPropertyOptional({ enum: WorkBudgetStatus })
  @IsOptional()
  @IsEnum(WorkBudgetStatus)
  status?: WorkBudgetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}
