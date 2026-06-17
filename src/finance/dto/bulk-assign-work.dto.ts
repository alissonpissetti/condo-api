import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class BulkAssignWorkDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'IDs das transações a vincular ou desvincular.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  transactionIds: string[];

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Obra de destino. Omitir ou `null` remove o vínculo das transações selecionadas.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  workId?: string | null;
}
