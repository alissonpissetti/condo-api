import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { PublishElectionDocumentDto } from './dto/publish-document.dto';
import { PlanningDocumentsService } from './planning-documents.service';

@ApiTags('Documentos')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId')
@UseGuards(JwtAuthGuard)
export class PlanningDocumentsController {
  constructor(private readonly documents: PlanningDocumentsService) {}

  @Get('documents')
  @ApiOperation({ summary: 'Listar documentos' })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.documents.list(condominiumId, userId);
  }

  @Get('documents/:documentId/file')
  @ApiOperation({ summary: 'Descarregar PDF' })
  async download(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { buffer, contentType, filename } = await this.documents.readFile(
      condominiumId,
      documentId,
      userId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }

  @Post('planning/polls/:pollId/minutes/draft')
  @ApiOperation({ summary: 'Gerar PDF de ata (rascunho)' })
  generateDraft(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
  ) {
    return this.documents.generateMinutesDraft(condominiumId, pollId, userId);
  }

  @Post('documents/:documentId/final-upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Anexar ata lavrada (PDF)' })
  uploadFinal(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo PDF obrigatório.');
    }
    return this.documents.uploadFinalPdf(
      condominiumId,
      documentId,
      userId,
      file.buffer,
    );
  }

  @Post('documents/:documentId/publish')
  @ApiOperation({
    summary: 'Publicar documento para todos; opcional atualização de gestão (eleição)',
  })
  publish(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: PublishElectionDocumentDto,
  ) {
    return this.documents.publish(condominiumId, documentId, userId, dto);
  }
}
