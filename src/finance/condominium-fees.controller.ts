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
  type CondominiumFeeChargePaymentLogView,
  type CondominiumFeeChargeView,
  type SendFeeSlipsWhatsappResult,
} from './condominium-fees.service';
import { CompetenceYmDto } from './dto/competence-ym.dto';
import { ReopenFeeChargePaymentDto } from './dto/reopen-fee-charge-payment.dto';
import { ReplaceFeeChargeReceiptDto } from './dto/replace-fee-charge-receipt.dto';
import { SettleFeeChargeDto } from './dto/settle-fee-charge.dto';
import { SendFeeSlipsWhatsappDto } from './dto/send-fee-slips-whatsapp.dto';
import { UpdateFeeChargesDueDateDto } from './dto/update-fee-charges-due-date.dto';
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

  @Post('update-due-date')
  @ApiOperation({
    summary:
      'Alterar a data de vencimento de uma ou mais cobranças da competência (gestão apenas).',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  updateChargesDueDate(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() body: UpdateFeeChargesDueDateDto,
  ): Promise<CondominiumFeeChargeView[]> {
    return this.feesService.updateChargesDueDate(
      condominiumId,
      userId,
      body.chargeIds,
      body.dueOn,
    );
  }

  @Get('transparency-pdf')
  @ApiOperation({
    summary:
      'PDF de transparência / fechamento mensal da competência: despesas do período, fundos, movimentos e extrato por unidade. Com `unitId`, antecede-se uma capa com slip de pagamento via PIX (cobrança em aberto e chave PIX configurada), seguida do mesmo relatório com destaque da unidade.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiQuery({ name: 'competenceYm', example: '2026-03' })
  @ApiQuery({
    name: 'unitId',
    required: false,
    format: 'uuid',
    description:
      'Opcional: PDF da unidade — capa slip PIX (QR e «Copia e cola» conforme configuração) quando houver taxa em aberto: o valor e o PIX refletem a soma de todas as competências em aberto para a unidade, com detalhamento na capa se forem mais de uma; em seguida o PDF de transparência da competência pedida com destaque da unidade.',
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

  @Post('send-slips-whatsapp')
  @ApiOperation({
    summary:
      'Enviar PDF slip (capa PIX + relatório) por WhatsApp às unidades em aberto',
    description:
      'Gera um link temporário (JWT) servido em GET /public/fee-slip.pdf para a Twilio anexar o PDF. Requer PUBLIC_BASE_URL na API (HTTPS acessível pela Twilio) e credenciais WhatsApp. Sem `unitIds`, envia a todas as unidades com cobrança em aberto na competência.',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  sendSlipsWhatsapp(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() body: SendFeeSlipsWhatsappDto,
  ): Promise<SendFeeSlipsWhatsappResult> {
    return this.feesService.sendFeeSlipsWhatsapp(condominiumId, userId, body);
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

  @Get(':chargeId/payment-history')
  @ApiOperation({
    summary:
      'Histórico de reaberturas e substituições de anexo de quitação (gestão).',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'chargeId', format: 'uuid' })
  paymentHistory(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('chargeId', ParseUUIDPipe) chargeId: string,
  ): Promise<CondominiumFeeChargePaymentLogView[]> {
    return this.feesService.listPaymentHistory(
      condominiumId,
      userId,
      chargeId,
    );
  }

  @Post(':chargeId/reopen-payment')
  @ApiOperation({
    summary:
      'Reabrir pagamento da cobrança quitada: volta a «em aberto», desvincula receita e anexo; regista histórico (ficheiros antigos permanecem no storage para auditoria).',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'chargeId', format: 'uuid' })
  reopenPayment(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('chargeId', ParseUUIDPipe) chargeId: string,
    @Body() body: ReopenFeeChargePaymentDto,
  ): Promise<CondominiumFeeChargeView> {
    return this.feesService.reopenPayment(
      condominiumId,
      userId,
      chargeId,
      body?.reason,
    );
  }

  @Post(':chargeId/replace-payment-receipt')
  @ApiOperation({
    summary:
      'Substituir apenas o anexo de comprovante de quitação (cobrança quitada). O ficheiro deve ser enviado antes (transaction-receipts); usa o mesmo storage que comprovantes (ex.: Nextcloud).',
  })
  @ApiParam({ name: 'condominiumId', format: 'uuid' })
  @ApiParam({ name: 'chargeId', format: 'uuid' })
  replacePaymentReceipt(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('chargeId', ParseUUIDPipe) chargeId: string,
    @Body() body: ReplaceFeeChargeReceiptDto,
  ): Promise<CondominiumFeeChargeView> {
    return this.feesService.replacePaymentReceipt(
      condominiumId,
      userId,
      chargeId,
      body.paymentReceiptStorageKey,
    );
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
