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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSupportTicketMessageDto } from '../support/dto/create-support-ticket-message.dto';
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

  @Post(':ticketId/messages')
  @ApiOperation({
    summary:
      'Responder ao cliente (envia e-mail com link para acompanhar o chamado)',
  })
  postMessage(
    @Req() req: Request & { user: { userId: string } },
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: CreateSupportTicketMessageDto,
  ) {
    return this.support.postMessageFromPlatform(
      req.user.userId,
      ticketId,
      dto.body,
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
