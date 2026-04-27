import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CondominiumLibraryService } from './condominium-library.service';

@ApiTags('Biblioteca do condomínio')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/library-documents')
@UseGuards(JwtAuthGuard)
export class CondominiumLibraryController {
  constructor(private readonly library: CondominiumLibraryService) {}

  @Get()
  @ApiOperation({ summary: 'Listar documentos da biblioteca' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.library.list(condominiumId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Enviar documento para a biblioteca' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        displayName: {
          type: 'string',
          description: 'Nome amigável para exibição na biblioteca.',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('displayName') displayName?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo.');
    }
    return this.library.upload(condominiumId, userId, file, displayName);
  }

  @Get(':documentId/file')
  @ApiOperation({ summary: 'Descarregar documento da biblioteca' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  async download(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { buffer, contentType, filename } = await this.library.readFile(
      condominiumId,
      documentId,
      userId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover documento da biblioteca (titular/síndico)' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  async remove(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    await this.library.remove(condominiumId, documentId, userId);
  }
}
