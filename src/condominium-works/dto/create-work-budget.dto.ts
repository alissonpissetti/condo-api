import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';
import { WorkBudgetStatus } from '../enums/work-budget-status.enum';

export class CreateWorkBudgetDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ example: 'Construtora ABC' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  supplierName?: string;

  @ApiPropertyOptional({
    description: 'O que o orçamento cobre (ex.: mão de obra, materiais).',
    example: 'Mão de obra',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description:
      'Valor em centavos (BRL). Opcional ao agendar visita (`awaiting_budget`).',
    example: 1500000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @ApiPropertyOptional({ description: 'AAAA-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validUntil?: string;

  @ApiPropertyOptional({
    description:
      'Agendamento da visita do fornecedor (YYYY-MM-DDTHH:mm, horário de São Paulo).',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/)
  scheduledAt?: string;

  @ApiPropertyOptional({
    enum: WorkBudgetStatus,
    default: WorkBudgetStatus.AwaitingBudget,
  })
  @IsOptional()
  @IsEnum(WorkBudgetStatus)
  status?: WorkBudgetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Data e hora do registro na timeline (YYYY-MM-DDTHH:mm). Padrão: agora.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/)
  recordedOn?: string;
}
