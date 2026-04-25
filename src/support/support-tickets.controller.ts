import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Express, Response } from 'express';
import { validateSync } from 'class-validator';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportService } from './support.service';

@ApiTags('Suporte')
@ApiBearerAuth('JWT')
@Controller('support/tickets')
@UseGuards(JwtAuthGuard)
export class SupportTicketsController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'Listar as minhas solicitações de suporte' })
  listMine(@CurrentUser() userId: string) {
    return this.support.listMine(userId);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['target', 'category', 'title', 'body'],
      properties: {
        target: { type: 'string', enum: ['platform', 'condominium'] },
        category: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        condominiumId: { type: 'string', format: 'uuid' },
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
      'Abrir solicitação (multipart: target, category, title, body, condominiumId opcional, files opcional). Sem arquivos, descrição com 10+ caracteres.',
  })
  create(
    @CurrentUser() userId: string,
    @Body('target') rawTarget: string,
    @Body('category') rawCategory: string,
    @Body('title') rawTitle: string,
    @Body('body') rawBody: string | undefined,
    @Body('condominiumId') rawCondominiumId: string | undefined,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const dto = new CreateSupportTicketDto();
    dto.target = (rawTarget ?? '').trim() as CreateSupportTicketDto['target'];
    dto.category = (rawCategory ?? '').trim() as CreateSupportTicketDto['category'];
    dto.title = (rawTitle ?? '').trim();
    dto.body = (rawBody ?? '').trim();
    const c = rawCondominiumId?.trim();
    dto.condominiumId = c && c.length > 0 ? c : undefined;
    const errs = validateSync(dto, { whitelist: true });
    if (errs.length > 0) {
      const parts = errs.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(parts.join(' ') || 'Dados inválidos.');
    }
    return this.support.create(userId, dto, files);
  }

  @Get(':ticketId/conversation')
  @ApiOperation({
    summary: 'Chamado com histórico de mensagens (apenas o titular do chamado)',
  })
  getConversation(
    @CurrentUser() userId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ) {
    return this.support.getConversationForUser(userId, ticketId);
  }

  @Get(':ticketId/attachment')
  @ApiOperation({ summary: 'Baixar anexo de uma mensagem (titular do chamado)' })
  async downloadAttachment(
    @CurrentUser() userId: string,
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
      await this.support.readAttachmentForUser(userId, ticketId, k);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }

  @Post(':ticketId/messages')
  @ApiOperation({
    summary:
      'Responder no chamado (multipart: campo body + opcionalmente vários arquivos em files)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'Texto da mensagem' },
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
  postUserMessage(
    @CurrentUser() userId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body('body') body: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.support.postMessageFromUser(
      userId,
      ticketId,
      body ?? '',
      files,
    );
  }

  @Get(':ticketId')
  @ApiOperation({ summary: 'Detalhe de uma solicitação minha' })
  getOne(
    @CurrentUser() userId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ) {
    return this.support.getMine(userId, ticketId);
  }
}
