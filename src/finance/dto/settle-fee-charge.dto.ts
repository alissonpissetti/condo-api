import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SettleFeeChargeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  incomeTransactionId: string;
}
