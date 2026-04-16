import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUnitDto {
  @ApiPropertyOptional({ example: '101-A' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  identifier?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  floor?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Nome do proprietário só para exibição (PDF/UI) sem associar pessoa na base.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ownerDisplayName?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Nome do responsável só para exibição (PDF/UI) sem associar pessoa na base.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  responsibleDisplayName?: string | null;
}
