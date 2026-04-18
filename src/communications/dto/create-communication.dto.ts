import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommunicationDto {
  @ApiProperty({ maxLength: 512 })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  title: string;

  @ApiPropertyOptional({ description: 'HTML rico (sanitizado no servidor).' })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  body?: string;
}
