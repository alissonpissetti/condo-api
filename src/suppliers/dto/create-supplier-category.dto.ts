import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupplierCategoryDto {
  @ApiProperty({ example: 'Encanador' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name: string;
}
