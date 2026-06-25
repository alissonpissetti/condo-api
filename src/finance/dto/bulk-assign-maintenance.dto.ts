import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class BulkAssignMaintenanceDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  transactionIds: string[];

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Manutenção de destino; omita ou null para desvincular.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  maintenanceId?: string | null;
}
