import {
  Controller,
  Get,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CondominiumFeesService } from './condominium-fees.service';

/**
 * URL com token JWT curto (fallback em dev com disco local). Em produção o WhatsApp
 * usa o link público do PDF gravado no Nextcloud (`fee-slips/…`).
 */
@ApiTags('Público — taxas')
@Controller('public')
export class PublicFeeSlipController {
  constructor(private readonly feesService: CondominiumFeesService) {}

  @Get('fee-slip.pdf')
  @ApiOperation({
    summary: 'Baixar PDF slip/capa PIX (token temporário)',
    description:
      'Token JWT emitido pela API ao disparar envio por WhatsApp. Uso interno / Twilio.',
  })
  @ApiQuery({ name: 'token', required: true })
  async feeSlipPdf(
    @Query('token') token: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const t = token?.trim();
    if (!t) {
      throw new UnauthorizedException('Token ausente.');
    }
    const pdf = await this.feesService.getFeeSlipPdfBufferFromPublicToken(t);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="taxa-condominial-slip.pdf"',
      'Cache-Control': 'private, no-store',
    });
    res.send(pdf);
  }
}
