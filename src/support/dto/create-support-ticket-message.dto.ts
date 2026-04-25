import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateSupportTicketMessageDto {
  @ApiProperty({
    maxLength: 20000,
    description: 'Texto da mensagem (pode ficar vazio se houver anexos no multipart).',
  })
  @IsString()
  @MaxLength(20000)
  body: string;
}
