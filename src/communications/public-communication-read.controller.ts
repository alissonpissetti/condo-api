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
import { PublicCommunicationViewDto } from './dto/public-communication-view.dto';
import { CommunicationsService } from './communications.service';

@ApiTags('Comunicação (público)')
@Controller('public')
export class PublicCommunicationReadController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('communications/attachments/:attachmentId/file')
  @ApiOperation({
    summary: 'Descarregar anexo do informativo com o mesmo token da página pública',
  })
  async downloadAttachment(
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Query('token') token: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const raw = typeof token === 'string' ? token : '';
    const { buffer, contentType, filename } =
      await this.communications.readAttachmentFileByReadToken(raw, attachmentId);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/"/g, '')}"`,
    );
    return res.send(buffer);
  }

  @Get('communications/view')
  @ApiOperation({
    summary:
      'Ver comunicado (JSON); cada visualização válida regista acesso (unidade e canal do token)',
  })
  async view(
    @Query('token') token: string | undefined,
  ): Promise<PublicCommunicationViewDto> {
    return this.communications.viewByReadToken(typeof token === 'string' ? token : '');
  }

  @Get('communication-read')
  @ApiOperation({
    summary:
      'Compatibilidade: redireciona para a página pública do comunicado (mesmo token)',
  })
  async legacyRedirect(
    @Query('token') token: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const plain = this.communications.normalizePublicReadToken(
      typeof token === 'string' ? token : '',
    );
    if (plain.length < 16) {
      throw new BadRequestException('Token inválido.');
    }
    const url = this.communications.buildPublicReadPageUrl(plain);
    if (url) {
      return res.redirect(302, url);
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(
      'Configure FRONTEND_PUBLIC_URL na API para abrir a página pública do comunicado.',
    );
  }
}
