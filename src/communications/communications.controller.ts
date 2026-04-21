import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AudiencePreviewDto } from './dto/audience-preview.dto';
import { CommunicationsService } from './communications.service';
import { CreateCommunicationDto } from './dto/create-communication.dto';
import { UpdateCommunicationDto } from './dto/update-communication.dto';

const ATTACHMENT_MAX_BYTES = 52 * 1024 * 1024;

@ApiTags('Comunicação')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/communications')
@UseGuards(JwtAuthGuard)
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar informativos (gestão: todos; morador: enviados ao utilizador)' })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.communications.list(condominiumId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar informativo em rascunho' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreateCommunicationDto,
  ) {
    return this.communications.create(condominiumId, userId, dto);
  }

  @Post('audience-preview')
  @ApiOperation({
    summary:
      'Pré-visualizar destinatários (contas de utilizador ligadas a proprietário ou responsável nas unidades)',
  })
  previewAudience(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: AudiencePreviewDto,
  ) {
    return this.communications.previewAudience(condominiumId, userId, dto);
  }

  @Get(':communicationId/attachments/:attachmentId/file')
  @ApiOperation({ summary: 'Descarregar anexo' })
  async downloadAttachment(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('communicationId', ParseUUIDPipe) communicationId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.communications.readAttachmentFile(
        condominiumId,
        communicationId,
        attachmentId,
        userId,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/"/g, '')}"`,
    );
    res.send(buffer);
  }

  @Get(':communicationId')
  @ApiOperation({ summary: 'Detalhe do informativo (com anexos e destinatários se gestão)' })
  getOne(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('communicationId', ParseUUIDPipe) communicationId: string,
  ) {
    return this.communications.getOne(condominiumId, communicationId, userId);
  }

  @Patch(':communicationId')
  @ApiOperation({
    summary:
      'Actualizar rascunho (título, texto, audiência, canais) ou só audiência/canais de um informativo já enviado',
  })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('communicationId', ParseUUIDPipe) communicationId: string,
    @Body() dto: UpdateCommunicationDto,
  ) {
    return this.communications.update(
      condominiumId,
      communicationId,
      userId,
      dto,
    );
  }

  @Post(':communicationId/send')
  @ApiOperation({
    summary:
      'Enviar informativo em rascunho ou reenviar um já enviado (novos links; audiência e canais do registo; links antigos mantêm-se válidos)',
  })
  send(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('communicationId', ParseUUIDPipe) communicationId: string,
  ) {
    return this.communications.send(condominiumId, communicationId, userId);
  }

  @Post(':communicationId/read')
  @ApiOperation({ summary: 'Registar leitura no painel (morador autenticado)' })
  markRead(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('communicationId', ParseUUIDPipe) communicationId: string,
  ) {
    return this.communications.markReadApp(
      condominiumId,
      communicationId,
      userId,
    );
  }

  @Post(':communicationId/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES } }),
  )
  @ApiOperation({ summary: 'Anexar ficheiro ao rascunho' })
  async addAttachment(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('communicationId', ParseUUIDPipe) communicationId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo obrigatório.');
    }
    return this.communications.addAttachment(
      condominiumId,
      communicationId,
      userId,
      file,
    );
  }

  @Delete(':communicationId/attachments/:attachmentId')
  @ApiOperation({ summary: 'Remover anexo do rascunho' })
  removeAttachment(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('communicationId', ParseUUIDPipe) communicationId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.communications.removeAttachment(
      condominiumId,
      communicationId,
      attachmentId,
      userId,
    );
  }
}
