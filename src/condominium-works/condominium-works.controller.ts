import {
  BadRequestException,
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
import { CondominiumWorksService } from './condominium-works.service';
import { parseCreateWorkBudgetBody } from './dto/parse-work-budget-body';
import { CreateWorkDto } from './dto/create-work.dto';
import { UpdateWorkBudgetDto } from './dto/update-work-budget.dto';
import { UpdateWorkDto } from './dto/update-work.dto';

@ApiTags('Obras do condomínio')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/works')
@UseGuards(JwtAuthGuard)
export class CondominiumWorksController {
  constructor(private readonly works: CondominiumWorksService) {}

  @Get()
  @ApiOperation({ summary: 'Listar obras do condomínio' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.works.list(condominiumId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar obra' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateWorkDto,
  ) {
    return this.works.create(condominiumId, userId, dto);
  }

  @Get(':workId')
  @ApiOperation({ summary: 'Detalhe da obra com timeline' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'workId', format: 'uuid' })
  getOne(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('workId', ParseUUIDPipe) workId: string,
  ) {
    return this.works.getOne(condominiumId, workId, userId);
  }

  @Patch(':workId')
  @ApiOperation({ summary: 'Atualizar obra' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'workId', format: 'uuid' })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Body() dto: UpdateWorkDto,
  ) {
    return this.works.update(condominiumId, workId, userId, dto);
  }

  @Delete(':workId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover obra' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'workId', format: 'uuid' })
  remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('workId', ParseUUIDPipe) workId: string,
  ) {
    return this.works.remove(condominiumId, workId, userId);
  }

  @Post(':workId/timeline/notes')
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
    @Param('workId', ParseUUIDPipe) workId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.works.addNote(
      condominiumId,
      workId,
      userId,
      body,
      files ?? [],
    );
  }

  @Post(':workId/timeline/legal')
  @ApiOperation({
    summary: 'Registro jurídico na timeline (contrato assinado ou documento)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        body: {
          type: 'string',
          description: 'Título ou descrição do contrato (opcional).',
        },
        recordedOn: {
          type: 'string',
          description: 'Data e hora (YYYY-MM-DDTHH:mm). Padrão: agora.',
        },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', undefined, {
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  addLegal(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.works.addLegal(
      condominiumId,
      workId,
      userId,
      body,
      files ?? [],
    );
  }

  @Post(':workId/timeline/budgets')
  @ApiOperation({ summary: 'Orçamento na timeline (com anexos opcionais)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        supplierName: { type: 'string' },
        amountCents: { type: 'string' },
        validUntil: { type: 'string' },
        status: { type: 'string' },
        notes: { type: 'string' },
        recordedOn: {
          type: 'string',
          description: 'Data e hora (YYYY-MM-DDTHH:mm). Padrão: agora.',
        },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['supplierName', 'amountCents'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', undefined, {
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  addBudget(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const dto = parseCreateWorkBudgetBody(body);
    return this.works.addBudget(
      condominiumId,
      workId,
      userId,
      dto,
      files ?? [],
    );
  }

  @Post(':workId/timeline/:entryId/attachments')
  @ApiOperation({ summary: 'Anexar arquivos a comentário ou orçamento' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', undefined, {
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  addTimelineEntryAttachments(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('Envie ao menos um arquivo.');
    }
    return this.works.addTimelineEntryAttachments(
      condominiumId,
      workId,
      entryId,
      userId,
      files,
    );
  }

  @Patch(':workId/budgets/:budgetId')
  @ApiOperation({ summary: 'Atualizar orçamento' })
  updateBudget(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('budgetId', ParseUUIDPipe) budgetId: string,
    @Body() dto: UpdateWorkBudgetDto,
  ) {
    return this.works.updateBudget(
      condominiumId,
      workId,
      budgetId,
      userId,
      dto,
    );
  }

  @Get(':workId/timeline/:entryId/attachments/:attachmentId/file')
  @ApiOperation({ summary: 'Download de anexo da timeline' })
  async downloadTimelineAttachment(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.works.readTimelineAttachmentFile(
        condominiumId,
        workId,
        entryId,
        attachmentId,
        userId,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':workId/timeline/:entryId/file')
  @ApiOperation({ summary: 'Download legado (documento na entrada)' })
  async downloadTimelineFile(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.works.readTimelineFile(
        condominiumId,
        workId,
        entryId,
        userId,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Delete(':workId/timeline/:entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover comentário ou orçamento da timeline' })
  removeTimelineEntry(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.works.removeTimelineEntry(
      condominiumId,
      workId,
      entryId,
      userId,
    );
  }
}
