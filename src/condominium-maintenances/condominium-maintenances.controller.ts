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
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { buildContentDispositionHeader } from '../common/http-content-disposition.util';
import { CondominiumMaintenancesService } from './condominium-maintenances.service';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceTimelineEntryDto } from './dto/update-maintenance-timeline-entry.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';

@ApiTags('Manutenções do condomínio')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/maintenances')
@UseGuards(JwtAuthGuard)
export class CondominiumMaintenancesController {
  constructor(
    private readonly maintenances: CondominiumMaintenancesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar manutenções do condomínio' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.maintenances.list(condominiumId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar manutenção' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateMaintenanceDto,
  ) {
    return this.maintenances.create(condominiumId, userId, dto);
  }

  @Get(':maintenanceId')
  @ApiOperation({ summary: 'Detalhe da manutenção com timeline' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'maintenanceId', format: 'uuid' })
  getOne(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('maintenanceId', ParseUUIDPipe) maintenanceId: string,
    @Query('includeFileUrls') includeFileUrls?: string,
  ) {
    const withUrls =
      includeFileUrls === '1' ||
      includeFileUrls?.trim().toLowerCase() === 'true';
    return this.maintenances.getOne(
      condominiumId,
      maintenanceId,
      userId,
      withUrls,
    );
  }

  @Patch(':maintenanceId')
  @ApiOperation({ summary: 'Atualizar manutenção' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'maintenanceId', format: 'uuid' })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('maintenanceId', ParseUUIDPipe) maintenanceId: string,
    @Body() dto: UpdateMaintenanceDto,
  ) {
    return this.maintenances.update(condominiumId, maintenanceId, userId, dto);
  }

  @Delete(':maintenanceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover manutenção' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'maintenanceId', format: 'uuid' })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('maintenanceId', ParseUUIDPipe) maintenanceId: string,
  ) {
    return this.maintenances.remove(condominiumId, maintenanceId, userId);
  }

  @Post(':maintenanceId/timeline/notes')
  @ApiOperation({ summary: 'Comentário na timeline (texto e/ou anexos)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        body: { type: 'string' },
        recordedOn: {
          type: 'string',
          description: 'Data e hora (YYYY-MM-DDTHH:mm). Padrão: agora.',
        },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', undefined, {
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  addNote(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('maintenanceId', ParseUUIDPipe) maintenanceId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.maintenances.addNote(
      condominiumId,
      maintenanceId,
      userId,
      body,
      files ?? [],
    );
  }

  @Patch(':maintenanceId/timeline/:entryId')
  @ApiOperation({ summary: 'Editar comentário na timeline' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'maintenanceId', format: 'uuid' })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  updateTimelineEntry(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('maintenanceId', ParseUUIDPipe) maintenanceId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: UpdateMaintenanceTimelineEntryDto,
  ) {
    return this.maintenances.updateTimelineEntry(
      condominiumId,
      maintenanceId,
      entryId,
      userId,
      dto,
    );
  }

  @Delete(':maintenanceId/timeline/:entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover comentário da timeline' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'maintenanceId', format: 'uuid' })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  removeTimelineEntry(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('maintenanceId', ParseUUIDPipe) maintenanceId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.maintenances.removeTimelineEntry(
      condominiumId,
      maintenanceId,
      entryId,
      userId,
    );
  }

  @Get(':maintenanceId/timeline/:entryId/attachments/:attachmentId/file')
  @ApiOperation({ summary: 'Download de anexo da timeline' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'maintenanceId', format: 'uuid' })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  async downloadTimelineAttachment(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('maintenanceId', ParseUUIDPipe) maintenanceId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.maintenances.readTimelineAttachmentFile(
        condominiumId,
        maintenanceId,
        entryId,
        attachmentId,
        userId,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      buildContentDispositionHeader('attachment', filename),
    );
    res.send(buffer);
  }

  @Get(':maintenanceId/timeline/:entryId/file')
  @ApiOperation({ summary: 'Download legado (documento na entrada)' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'maintenanceId', format: 'uuid' })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  async downloadTimelineLegacyFile(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('maintenanceId', ParseUUIDPipe) maintenanceId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.maintenances.readTimelineLegacyFile(
        condominiumId,
        maintenanceId,
        entryId,
        userId,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      buildContentDispositionHeader('attachment', filename),
    );
    res.send(buffer);
  }
}
