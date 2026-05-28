import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateWorkBudgetDto {
  @ApiProperty({ example: 'Construtora ABC' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  supplierName: string;

  @ApiProperty({ description: 'Valor em centavos (BRL)', example: 1500000 })
  @IsInt()
  @Min(0)
  amountCents: number;

  @ApiPropertyOptional({ description: 'AAAA-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validUntil?: string;

  @ApiPropertyOptional({ enum: WorkBudgetStatus, default: WorkBudgetStatus.Received })
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
