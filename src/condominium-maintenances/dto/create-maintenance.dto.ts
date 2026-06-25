import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MaintenanceStatus } from '../enums/maintenance-status.enum';

export class CreateMaintenanceDto {
  @ApiProperty({ example: 'Correção no portão eletrônico' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Portão principal' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ description: 'Peças ou itens trocados (garantia).' })
  @IsOptional()
  @IsString()
  replacedParts?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  supplierName?: string;

  @ApiPropertyOptional({ enum: MaintenanceStatus, default: MaintenanceStatus.Open })
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;
}
