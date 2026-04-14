import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { GovernanceService } from './governance.service';

@ApiTags('Governança')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId')
@UseGuards(JwtAuthGuard)
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get('access')
  @ApiOperation({ summary: 'Papel do utilizador neste condomínio' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  async access(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    const access = await this.governance.assertAnyAccess(condominiumId, userId);
    return { access };
  }

  @Get('participants')
  @ApiOperation({ summary: 'Listar participantes de gestão' })
  async listParticipants(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    await this.governance.assertManagement(condominiumId, userId);
    return this.governance.listParticipants(condominiumId);
  }

  @Post('participants')
  @ApiOperation({ summary: 'Adicionar ou atualizar participante (síndico/admin)' })
  async createParticipant(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateParticipantDto,
  ) {
    return this.governance.createParticipant(condominiumId, userId, dto);
  }

  @Delete('participants/:participantId')
  @ApiOperation({ summary: 'Remover participante' })
  async removeParticipant(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
  ) {
    await this.governance.removeParticipant(
      condominiumId,
      userId,
      participantId,
    );
    return { ok: true };
  }
}
