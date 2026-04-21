import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupportTicketMessageDto {
  @ApiProperty({ maxLength: 20000 })
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body: string;
}
