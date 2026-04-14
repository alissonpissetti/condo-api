import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { GovernanceRole } from '../enums/governance-role.enum';

export class CreateParticipantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  personId?: string | null;

  @ApiProperty({ enum: GovernanceRole })
  @IsEnum(GovernanceRole)
  role: GovernanceRole;
}
