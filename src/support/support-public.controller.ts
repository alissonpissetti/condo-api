import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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

  @Get('tickets/:ticketId/attachment')
  @ApiOperation({
    summary: 'Baixar anexo com o token vt (mesmo acesso do link do e-mail)',
  })
  async downloadAttachment(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Query('vt') viewToken: string,
    @Query('key') key: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const vt = viewToken?.trim();
    if (!vt) {
      throw new BadRequestException('Indique o parâmetro vt (token do link).');
    }
    const k = key?.trim();
    if (!k) {
      res.status(400).send('Parâmetro key é obrigatório.');
      return;
    }
    const { buffer, contentType, filename } =
      await this.support.readAttachmentPublic(ticketId, vt, k);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }
}
