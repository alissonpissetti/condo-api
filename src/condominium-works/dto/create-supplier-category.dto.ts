import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupplierCategoryDto {
  @ApiProperty({ example: 'Impermeabilização' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;
}
