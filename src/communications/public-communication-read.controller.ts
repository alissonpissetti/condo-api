import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CommunicationsService } from './communications.service';

@ApiTags('Comunicação (público)')
@Controller('public')
export class PublicCommunicationReadController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('communication-read')
  @ApiOperation({
    summary:
      'Confirmar leitura via token do e-mail/SMS (redireciona para o painel com ?leitura=1)',
  })
  async confirmRead(
    @Query('token') token: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const raw = typeof token === 'string' ? token.trim() : '';
    if (raw.length < 16) {
      throw new BadRequestException('Token inválido.');
    }
    const { redirectUrl } = await this.communications.confirmReadByToken({
      token: raw,
    });
    if (redirectUrl) {
      return res.redirect(302, redirectUrl);
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send('Leitura registada. Abra o painel do condomínio para ver o informativo.');
  }
}
