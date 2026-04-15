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
import { AssignUnitPersonDto } from './dto/assign-unit-person.dto';
import { PeopleService } from './people.service';

@ApiTags('Unidades — pessoas')
@ApiBearerAuth('JWT')
@Controller(
  'condominiums/:condominiumId/groupings/:groupingId/units/:unitId/people',
)
@UseGuards(JwtAuthGuard)
export class UnitPeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get('candidate')
  @ApiOperation({
    summary: 'Pesquisar pessoa por CPF ou email',
    description:
      'Indica se já existe ficha de pessoa ou utilizador com o email antes de associar ou convidar.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'groupingId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiQuery({ name: 'cpf', required: false })
  @ApiQuery({ name: 'email', required: false })
  personCandidate(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Query('cpf') cpf?: string,
    @Query('email') email?: string,
  ) {
    return this.peopleService.personCandidate(
      condominiumId,
      groupingId,
      unitId,
      userId,
      cpf,
      email,
    );
  }

  @Get('invitations')
  @ApiOperation({ summary: 'Listar convites pendentes para a unidade' })
  listInvitations(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ) {
    return this.peopleService.listPendingInvitations(
      condominiumId,
      groupingId,
      unitId,
      userId,
    );
  }

  @Post('assign')
  @ApiOperation({
    summary: 'Associar proprietário / responsável ou enviar convite',
    description:
      'Se existir pessoa ou utilizador com o email/CPF, associa já à unidade. Se não existir, o email no corpo é obrigatório: cria ficha, convite e envia email (a unidade só é atualizada quando o convite for aceite).',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'groupingId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  assign(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: AssignUnitPersonDto,
  ) {
    return this.peopleService.assignToUnit(
      condominiumId,
      groupingId,
      unitId,
      userId,
      dto,
    );
  }

  @Delete('responsible')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remover responsável pela unidade',
    description:
      'Limpa o vínculo do responsável (ex.: inquilino). O proprietário, se existir, não é alterado.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'groupingId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  clearResponsible(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ) {
    return this.peopleService.clearResponsibleFromUnit(
      condominiumId,
      groupingId,
      unitId,
      userId,
    );
  }
}
