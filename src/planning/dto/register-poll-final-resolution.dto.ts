import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum PollFinalResolutionOutcome {
  Postpone = 'postpone',
  Withdraw = 'withdraw',
}

export class RegisterPollFinalResolutionDto {
  @ApiProperty({
    enum: PollFinalResolutionOutcome,
    description:
      'postpone = prorrogar a deliberação; withdraw = cancelar a necessidade desta pauta.',
  })
  @IsEnum(PollFinalResolutionOutcome)
  outcome: PollFinalResolutionOutcome;

  @ApiProperty({
    description: 'Parecer final da reunião (texto livre).',
    minLength: 10,
    maxLength: 12000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(12000)
  opinion: string;

  @ApiPropertyOptional({
    description:
      'Nova data de abertura (ISO 8601), só para prorrogação. Se omitida, mantém-se a actual.',
  })
  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @ApiPropertyOptional({
    description:
      'Nova data de encerramento (ISO 8601), só para prorrogação. Se omitida, mantém-se a actual.',
  })
  @IsOptional()
  @IsDateString()
  closesAt?: string;
}
