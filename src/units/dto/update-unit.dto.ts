import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

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

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description:
      'Responsável financeiro da unidade: deve ser o `personId` de alguém já na lista de responsáveis. Obrigatório para mostrar um único nome em taxas quando há mais de um responsável. Use `null` para limpar.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  financialResponsiblePersonId?: string | null;
}
