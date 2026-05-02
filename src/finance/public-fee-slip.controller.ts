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
 * URL pública (token JWT curto) para o Twilio obter o PDF ao enviar `mediaUrl`
 * no WhatsApp. Não usa cabeçalho Authorization.
 */
@ApiTags('Público — taxas')
@Controller('public')
export class PublicFeeSlipController {
  constructor(private readonly feesService: CondominiumFeesService) {}

  @Get('fee-slip.pdf')
  @ApiOperation({
    summary: 'Descarregar PDF slip/capa PIX (token temporário)',
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
      throw new UnauthorizedException('Token em falta.');
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
