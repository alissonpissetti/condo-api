import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { GovernanceService } from '../planning/governance.service';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';

@ApiTags('Financeiro — comprovantes')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/transaction-receipts')
@UseGuards(JwtAuthGuard)
export class TransactionReceiptsController {
  constructor(
    @Inject(RECEIPT_STORAGE) private readonly storage: ReceiptStoragePort,
    private readonly governance: GovernanceService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Enviar comprovante (PDF ou imagem)' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  async upload(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    await this.governance.assertManagement(condominiumId, userId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo.');
    }
    const mime = file.mimetype;
    const key = await this.storage.saveTransactionReceipt(
      condominiumId,
      file.buffer,
      mime,
    );
    return { receiptStorageKey: key };
  }

  @Get('file')
  @ApiOperation({ summary: 'Baixar comprovante pela chave (query key)' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  async download(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query('key') key: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    await this.governance.assertManagement(condominiumId, userId);
    if (!key) {
      throw new BadRequestException('Parâmetro key é obrigatório.');
    }
    const { buffer, contentType, filename } = await this.storage.readReceipt(
      condominiumId,
      decodeURIComponent(key),
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
