import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateGroupingDto } from './dto/create-grouping.dto';
import { UpdateGroupingDto } from './dto/update-grouping.dto';
import { GroupingsService } from './groupings.service';

@ApiTags('Agrupamentos')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/groupings')
@UseGuards(JwtAuthGuard)
export class GroupingsController {
  constructor(private readonly groupingsService: GroupingsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar agrupamento (bloco) no condomínio' })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateGroupingDto,
  ) {
    return this.groupingsService.create(condominiumId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar agrupamentos do condomínio' })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  findAll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.groupingsService.findAll(condominiumId, userId);
  }

  @Get('with-units')
  @ApiOperation({
    summary: 'Listar agrupamentos com unidades (árvore do condomínio)',
    description:
      'Uma resposta agregada para o painel; evita N+1 pedidos por agrupamento.',
  })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  findAllWithUnits(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.groupingsService.findAllWithUnits(condominiumId, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter um agrupamento' })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID do agrupamento',
  })
  findOne(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groupingsService.findOne(condominiumId, id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar agrupamento' })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID do agrupamento',
  })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupingDto,
  ) {
    return this.groupingsService.update(condominiumId, id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Excluir agrupamento',
    description: 'Não é permitido excluir o último agrupamento do condomínio.',
  })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID do agrupamento',
  })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groupingsService.remove(condominiumId, id, userId);
  }
}
