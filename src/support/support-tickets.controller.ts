import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateSupportTicketMessageDto } from './dto/create-support-ticket-message.dto';
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
  @ApiOperation({
    summary:
      'Abrir solicitação (erro, correção, melhoria ou nova funcionalidade); condomínio opcional para contexto',
  })
  create(@CurrentUser() userId: string, @Body() dto: CreateSupportTicketDto) {
    return this.support.create(userId, dto);
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

  @Post(':ticketId/messages')
  @ApiOperation({ summary: 'Responder no chamado (utilizador)' })
  postUserMessage(
    @CurrentUser() userId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: CreateSupportTicketMessageDto,
  ) {
    return this.support.postMessageFromUser(userId, ticketId, dto.body);
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
