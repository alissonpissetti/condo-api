import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}
