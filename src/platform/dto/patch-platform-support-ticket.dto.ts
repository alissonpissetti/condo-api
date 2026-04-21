import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SupportTicketStatus } from '../../support/enums/support-ticket-status.enum';

export class PatchPlatformSupportTicketDto {
  @ApiProperty({ enum: SupportTicketStatus })
  @IsEnum(SupportTicketStatus)
  status: SupportTicketStatus;
}
