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
import { CreateConstructionProjectDto } from './dto/create-construction-project.dto';
import { CreateProjectUpdateDto } from './dto/create-project-update.dto';
import { UpdateConstructionProjectDto } from './dto/update-construction-project.dto';
import { UpdateProjectUpdateDto } from './dto/update-project-update.dto';
import { ConstructionWorksService } from './construction-works.service';

@ApiTags('Obras')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/works')
@UseGuards(JwtAuthGuard)
export class ConstructionWorksController {
  constructor(private readonly works: ConstructionWorksService) {}

  @Get()
  @ApiOperation({ summary: 'Listar obras (transparência: qualquer acesso ao condomínio)' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.works.listProjects(condominiumId, userId);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Detalhe da obra com linha do tempo de atualizações' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  getOne(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.works.getProject(condominiumId, projectId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar obra (gestão)' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateConstructionProjectDto,
  ) {
    return this.works.createProject(condominiumId, userId, dto);
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Atualizar obra (gestão)' })
  patchProject(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateConstructionProjectDto,
  ) {
    return this.works.updateProject(condominiumId, projectId, userId, dto);
  }

  @Delete(':projectId')
  @ApiOperation({ summary: 'Excluir obra e atualizações (gestão)' })
  removeProject(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.works.removeProject(condominiumId, projectId, userId);
  }

  @Post(':projectId/updates')
  @ApiOperation({ summary: 'Publicar atualização na obra (gestão)' })
  addUpdate(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateProjectUpdateDto,
  ) {
    return this.works.createUpdate(condominiumId, projectId, userId, dto);
  }

  @Patch(':projectId/updates/:updateId')
  @ApiOperation({ summary: 'Editar atualização (gestão)' })
  patchUpdate(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('updateId', ParseUUIDPipe) updateId: string,
    @Body() dto: UpdateProjectUpdateDto,
  ) {
    return this.works.updateUpdate(
      condominiumId,
      projectId,
      updateId,
      userId,
      dto,
    );
  }

  @Delete(':projectId/updates/:updateId')
  @ApiOperation({ summary: 'Remover atualização (gestão)' })
  removeUpdate(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('updateId', ParseUUIDPipe) updateId: string,
  ) {
    return this.works.removeUpdate(condominiumId, projectId, updateId, userId);
  }
}
