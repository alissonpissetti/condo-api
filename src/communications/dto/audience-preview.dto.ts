import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';

export class AudiencePreviewDto {
  @ApiProperty({ enum: ['units', 'groupings'] })
  @IsIn(['units', 'groupings'])
  scope: 'units' | 'groupings';

  @ApiPropertyOptional({
    type: [String],
    description:
      'Com `scope=units`: UUIDs das unidades; vazio ou omitido = todas as unidades.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  unitIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Com `scope=groupings`: UUIDs dos agrupamentos; vazio = todos os agrupamentos.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  groupingIds?: string[];
}
