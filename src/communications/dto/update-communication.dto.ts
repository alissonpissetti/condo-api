import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RecipientDeliveryPrefDto } from './recipient-delivery-pref.dto';

export class UpdateCommunicationDto {
  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  body?: string;

  @ApiPropertyOptional({ enum: ['units', 'groupings'] })
  @IsOptional()
  @IsIn(['units', 'groupings'])
  audienceScope?: 'units' | 'groupings';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  audienceUnitIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  audienceGroupingIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  channelEmailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  channelSmsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  channelWhatsappEnabled?: boolean;

  @ApiPropertyOptional({
    type: [RecipientDeliveryPrefDto],
    description:
      'Preferências por destinatário; omitir canal = usar o interruptor global do informativo.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDeliveryPrefDto)
  recipientDeliveryPrefs?: RecipientDeliveryPrefDto[];
}
