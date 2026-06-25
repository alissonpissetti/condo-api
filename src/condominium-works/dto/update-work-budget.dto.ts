import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { WorkBudgetStatus } from '../enums/work-budget-status.enum';

export class UpdateWorkBudgetDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  supplierId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  supplierName?: string;

  @ApiPropertyOptional({
    description: 'O que o orçamento cobre (ex.: mão de obra, materiais).',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validUntil?: string | null;

  @ApiPropertyOptional({
    description:
      'Agendamento da visita do fornecedor (YYYY-MM-DDTHH:mm, horário de São Paulo).',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/)
  scheduledAt?: string | null;

  @ApiPropertyOptional({ enum: WorkBudgetStatus })
  @IsOptional()
  @IsEnum(WorkBudgetStatus)
  status?: WorkBudgetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}
