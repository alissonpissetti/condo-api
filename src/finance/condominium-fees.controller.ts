import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import {
  CondominiumFeesService,
  type CondominiumFeeChargeView,
} from './condominium-fees.service';
import { CompetenceYmDto } from './dto/competence-ym.dto';
import { SettleFeeChargeDto } from './dto/settle-fee-charge.dto';
import { MonthlyTransparencyPdfService } from './monthly-transparency-pdf.service';

@ApiTags('Financeiro — taxas condominiais')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/condominium-fees')
@UseGuards(JwtAuthGuard)
export class CondominiumFeesController {
  constructor(
    private readonly feesService: CondominiumFeesService,
    private readonly monthlyTransparencyPdf: MonthlyTransparencyPdfService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar cobranças da competência' })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiQuery({ name: 'competenceYm', example: '2026-03' })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query('competenceYm') competenceYm: string,
  ): Promise<CondominiumFeeChargeView[]> {
    return this.feesService.listCharges(
      condominiumId,
      userId,
      competenceYm ?? '',
    );
  }

  @Post('close-month')
  @ApiOperation({
    summary: 'Fechar mês (acrual de fundos + cobranças), igual ao cron',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  closeMonth(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() body: CompetenceYmDto,
  ): Promise<CondominiumFeeChargeView[]> {
    return this.feesService.closeMonth(
      condominiumId,
      userId,
      body.competenceYm,
    );
  }

  @Post('regenerate-month')
  @ApiOperation({
    summary:
      'Regenerar cobranças (apaga cobranças em aberto, refaz mensalidades de fundo da competência e recalcula taxas). Bloqueado se existir cobrança paga.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  regenerateMonth(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() body: CompetenceYmDto,
  ): Promise<CondominiumFeeChargeView[]> {
    return this.feesService.regenerateMonth(
      condominiumId,
      userId,
      body.competenceYm,
    );
  }

  @Get('transparency-pdf')
  @ApiOperation({
    summary:
      'PDF de transparência / fechamento mensal. Quando `unitId` é informado, a 1ª página é o slip de pagamento (valor da unidade, chave PIX, QR Code com valor + referência «Condomínio - MM/AAAA»).',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiQuery({ name: 'competenceYm', example: '2026-03' })
  @ApiQuery({
    name: 'unitId',
    required: false,
    format: 'uuid',
    description:
      'Quando informado, gera o PDF específico da unidade (1ª página = slip de pagamento com QR Code PIX do valor devido).',
  })
  async transparencyPdf(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query('competenceYm') competenceYm: string,
    @Query('unitId') unitId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const normalizedUnitId = unitId?.trim() || null;
    const pdf = await this.monthlyTransparencyPdf.buildClosingTransparencyPdf(
      condominiumId,
      userId,
      competenceYm ?? '',
      normalizedUnitId,
    );
    const ym = (competenceYm ?? 'fechamento').replace(/[^\d-]/g, '').slice(0, 7);
    const unitSuffix = normalizedUnitId
      ? `-unidade-${normalizedUnitId.slice(0, 8)}`
      : '';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="transparencia-condominial-${ym || 'mes'}${unitSuffix}.pdf"`,
    });
    return new StreamableFile(pdf);
  }

  @Get(':chargeId/payment-receipt')
  @ApiOperation({
    summary: 'Comprovante de pagamento em PDF (apenas cobrança já paga)',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'chargeId', format: 'uuid' })
  async paymentReceipt(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('chargeId', ParseUUIDPipe) chargeId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.feesService.getPaymentReceiptPdf(
      condominiumId,
      userId,
      chargeId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="comprovante-taxa-${chargeId.slice(0, 8)}.pdf"`,
    });
    return new StreamableFile(pdf);
  }

  @Post(':chargeId/settle')
  @ApiOperation({
    summary:
      'Quitar cobrança. Sem corpo (ou sem incomeTransactionId): quita na data atual e gera comprovante via GET payment-receipt. Com UUID: valida receita rateada (legado).',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'chargeId', format: 'uuid' })
  settle(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('chargeId', ParseUUIDPipe) chargeId: string,
    @Body() body: SettleFeeChargeDto,
  ): Promise<CondominiumFeeChargeView> {
    return this.feesService.settle(
      condominiumId,
      userId,
      chargeId,
      body?.incomeTransactionId,
      body?.paymentReceiptStorageKey ?? null,
    );
  }

  @Get(':chargeId/payment-receipt-file')
  @ApiOperation({
    summary:
      'Baixar comprovante de pagamento (imagem ou PDF) anexado ao quitar a cobrança.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'chargeId', format: 'uuid' })
  async paymentReceiptFile(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('chargeId', ParseUUIDPipe) chargeId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const { buffer, contentType, filename } =
      await this.feesService.getPaymentReceiptFile(
        condominiumId,
        userId,
        chargeId,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
}
