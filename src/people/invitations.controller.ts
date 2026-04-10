import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InvitePreviewResponseDto } from './dto/invite-preview-response.dto';
import { PeopleService } from './people.service';

@ApiTags('Convites (público)')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly peopleService: PeopleService) {}

  @Post('accept/:token')
  @ApiOperation({
    summary: 'Aceitar convite e criar utilizador',
    description:
      'Cria a conta com o email do convite, associa à ficha de pessoa e define proprietário/responsável na unidade.',
  })
  @ApiParam({ name: 'token', description: 'Token recebido no link do convite' })
  accept(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.peopleService.acceptInvite(token, dto);
  }

  @Get(':token')
  @ApiOperation({
    summary: 'Pré-visualizar convite',
    description:
      'Dados mínimos para a página de cadastro (sem expor o email completo).',
  })
  @ApiParam({ name: 'token', description: 'Token recebido no link do convite' })
  preview(@Param('token') token: string): Promise<InvitePreviewResponseDto> {
    return this.peopleService.getInvitePreview(token);
  }
}
