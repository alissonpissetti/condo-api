import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupportService } from './support.service';

@ApiTags('Suporte (público)')
@Controller('support/public')
export class SupportPublicController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets/:ticketId')
  @ApiOperation({
    summary:
      'Ver chamado e respostas com o token enviado por e-mail (parâmetro de consulta vt)',
  })
  getTicketThread(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Query('vt') viewToken: string,
  ) {
    const vt = viewToken?.trim();
    if (!vt) {
      throw new BadRequestException('Indique o parâmetro vt (token do link).');
    }
    return this.support.getPublicConversation(ticketId, vt);
  }
}
