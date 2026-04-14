import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CompetenceYmDto {
  @ApiProperty({ example: '2026-03', description: 'Competência AAAA-MM' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  competenceYm: string;
}
