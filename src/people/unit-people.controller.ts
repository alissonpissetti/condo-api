import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { PatchUnitPersonPhoneDto } from './dto/patch-unit-person-phone.dto';
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
      'Indica se já existe ficha de pessoa ou usuário com o e-mail antes de associar ou convidar.',
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

  @Patch(':personId/phone')
  @ApiOperation({
    summary: 'Atualizar telefone do proprietário ou responsável (síndico/titular)',
    description:
      'Apenas o titular da conta ou o síndico. A pessoa tem de estar ligada à unidade como proprietária ou responsável identificada.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'groupingId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiParam({ name: 'personId', format: 'uuid' })
  patchPersonPhone(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Param('personId', ParseUUIDPipe) personId: string,
    @Body() dto: PatchUnitPersonPhoneDto,
  ) {
    return this.peopleService.patchPersonPhoneForUnit(
      condominiumId,
      groupingId,
      unitId,
      personId,
      userId,
      dto,
    );
  }

  @Post('assign')
  @ApiOperation({
    summary: 'Associar proprietário / responsável ou enviar convite',
    description:
      'Se existir pessoa ou usuário com o e-mail/CPF, associa já à unidade. Se não existir, o e-mail no corpo é obrigatório: cria ficha, convite e envia e-mail (a unidade só é atualizada quando o convite for aceito).',
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

  @Delete('responsible/:personId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remover uma pessoa da lista de responsáveis da unidade',
    description:
      'Retira só o vínculo indicado; as outras pessoas responsáveis mantêm-se.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'groupingId', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiParam({ name: 'personId', format: 'uuid' })
  removeOneResponsible(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Param('personId', ParseUUIDPipe) personId: string,
  ) {
    return this.peopleService.removeResponsiblePersonFromUnit(
      condominiumId,
      groupingId,
      unitId,
      personId,
      userId,
    );
  }

  @Delete('responsible')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remover todos os responsáveis pela unidade',
    description:
      'Limpa todos os vínculos de responsáveis (ex.: inquilinos). O proprietário, se existir, não é alterado.',
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
