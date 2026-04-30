import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateCondominiumInviteDto } from './dto/create-condominium-invite.dto';
import { PeopleService } from './people.service';

@ApiTags('Condomínio — convites (onboarding)')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/invitations')
@UseGuards(JwtAuthGuard)
export class CondominiumInvitationsController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get('lookup')
  @ApiOperation({
    summary: 'Pré-visualizar pessoa (convite ao condomínio)',
    description:
      'Passe ?email= ou ?phone= (um por vez) para checar se já existe cadastro.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({ name: 'phone', required: false })
  lookup(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
  ) {
    return this.peopleService.lookupContactForCondominiumInvite(
      condominiumId,
      userId,
      email,
      phone,
    );
  }

  @Get('pending')
  @ApiOperation({ summary: 'Listar convites pendentes ao condomínio' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  listPending(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.peopleService.listPendingCondominiumInvitations(
      condominiumId,
      userId,
    );
  }

  @Get('history')
  @ApiOperation({
    summary: 'Listar convites já aceitos (histórico)',
    description: 'Convites com registro concluído neste condomínio, mais recentes primeiro.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  listHistory(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.peopleService.listHistoricCondominiumInvitations(
      condominiumId,
      userId,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Criar convite (e-mail e/ou WhatsApp, onboarding)',
    description:
      'Envia o mesmo conteúdo por e-mail (SMTP) e/ou WhatsApp (Twilio), conforme o contato informado. ' +
      'Falta pelo menos e-mail ou celular.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateCondominiumInviteDto,
  ) {
    return this.peopleService.createCondominiumInvitation(
      condominiumId,
      userId,
      dto,
    );
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remover convite pendente',
    description:
      'Invalida o link do convite. Não remove a ficha de pessoa associada.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'invitationId', format: 'uuid' })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    return this.peopleService.deleteCondominiumInvitation(
      condominiumId,
      invitationId,
      userId,
    );
  }
}
