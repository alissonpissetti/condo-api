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
import { CreateCondominiumDto } from './dto/create-condominium.dto';
import { UpdateCondominiumDto } from './dto/update-condominium.dto';
import { CondominiumsService } from './condominiums.service';

@ApiTags('Condomínios')
@ApiBearerAuth('JWT')
@Controller('condominiums')
@UseGuards(JwtAuthGuard)
export class CondominiumsController {
  constructor(private readonly condominiumsService: CondominiumsService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar condomínio',
    description:
      'Cria o condomínio e um agrupamento padrão "Geral" em transação.',
  })
  create(@CurrentUser() userId: string, @Body() dto: CreateCondominiumDto) {
    return this.condominiumsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar condomínios do utilizador autenticado' })
  findAll(@CurrentUser() userId: string) {
    return this.condominiumsService.findAllForOwner(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter um condomínio (titular, gestão ou morador com unidade)',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID do condomínio' })
  findOne(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.condominiumsService.findOneAccessible(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar condomínio' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID do condomínio' })
  update(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCondominiumDto,
  ) {
    return this.condominiumsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar condomínio (e agrupamentos/unidades)' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID do condomínio' })
  remove(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.condominiumsService.remove(id, userId);
  }
}
