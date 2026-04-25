import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Express, Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupportService } from '../support/support.service';
import { PatchPlatformSupportTicketDto } from './dto/patch-platform-support-ticket.dto';
import { PlatformSupportTicketsQueryDto } from './dto/platform-support-tickets-query.dto';
import { PlatformAdminGuard } from './platform-admin.guard';

@ApiTags('Plataforma — Suporte')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('platform/support-tickets')
export class PlatformSupportTicketsController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'Listar solicitações de suporte (paginado)' })
  list(@Query() q: PlatformSupportTicketsQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    return this.support.listForPlatform(page, limit, q.status);
  }

  @Get(':ticketId/conversation')
  @ApiOperation({ summary: 'Chamado com mensagens (administração)' })
  getConversation(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.support.getConversationForPlatform(ticketId);
  }

  @Get(':ticketId/attachment')
  @ApiOperation({ summary: 'Baixar anexo de uma mensagem (administração)' })
  async downloadAttachment(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Query('key') key: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const k = key?.trim();
    if (!k) {
      res.status(400).send('Parâmetro key é obrigatório.');
      return;
    }
    const { buffer, contentType, filename } =
      await this.support.readAttachmentForPlatform(ticketId, k);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }

  @Post(':ticketId/messages')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'Texto da resposta' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 8, { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  @ApiOperation({
    summary:
      'Responder ao cliente (multipart: campo body + opcionalmente arquivos em files; envia e-mail com link)',
  })
  postMessage(
    @Req() req: Request & { user: { userId: string } },
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body('body') body: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.support.postMessageFromPlatform(
      req.user.userId,
      ticketId,
      body ?? '',
      files,
    );
  }

  @Get(':ticketId')
  @ApiOperation({ summary: 'Detalhe de uma solicitação' })
  getOne(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.support.getForPlatform(ticketId);
  }

  @Patch(':ticketId')
  @ApiOperation({ summary: 'Atualizar estado da solicitação' })
  patch(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: PatchPlatformSupportTicketDto,
  ) {
    return this.support.patchStatusForPlatform(ticketId, dto.status);
  }
}
