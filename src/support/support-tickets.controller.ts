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

  @Get(':ticketId')
  @ApiOperation({ summary: 'Detalhe de uma solicitação minha' })
  getOne(
    @CurrentUser() userId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ) {
    return this.support.getMine(userId, ticketId);
  }
}
