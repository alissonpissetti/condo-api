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
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitsService } from './units.service';

@ApiTags('Unidades')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/groupings/:groupingId/units')
@UseGuards(JwtAuthGuard)
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar unidade no agrupamento' })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  @ApiParam({
    name: 'groupingId',
    format: 'uuid',
    description: 'ID do agrupamento',
  })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
    @Body() dto: CreateUnitDto,
  ) {
    return this.unitsService.create(condominiumId, groupingId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar unidades do agrupamento' })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  @ApiParam({
    name: 'groupingId',
    format: 'uuid',
    description: 'ID do agrupamento',
  })
  findAll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
  ) {
    return this.unitsService.findAll(condominiumId, groupingId, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter uma unidade' })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  @ApiParam({
    name: 'groupingId',
    format: 'uuid',
    description: 'ID do agrupamento',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID da unidade',
  })
  findOne(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.unitsService.findOne(condominiumId, groupingId, id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar unidade' })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  @ApiParam({
    name: 'groupingId',
    format: 'uuid',
    description: 'ID do agrupamento',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID da unidade',
  })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.unitsService.update(condominiumId, groupingId, id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar unidade' })
  @ApiParam({
    name: 'condominiumId',
    format: 'uuid',
    description: 'ID do condomínio',
  })
  @ApiParam({
    name: 'groupingId',
    format: 'uuid',
    description: 'ID do agrupamento',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ID da unidade',
  })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('groupingId', ParseUUIDPipe) groupingId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.unitsService.remove(condominiumId, groupingId, id, userId);
  }
}
