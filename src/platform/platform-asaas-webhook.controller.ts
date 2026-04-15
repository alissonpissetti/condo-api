import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformBillingAsaasService } from './platform-billing-asaas.service';

@ApiTags('Plataforma (SaaS)')
@Controller('platform/webhooks')
export class PlatformAsaasWebhookController {
  constructor(private readonly billingAsaas: PlatformBillingAsaasService) {}

  @Post('asaas')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook Asaas (pagamentos SaaS)' })
  receive(
    @Body() body: Record<string, unknown>,
    @Headers('asaas-access-token') asaasAccessToken?: string,
  ) {
    const expected = process.env.ASAAS_WEBHOOK_ACCESS_TOKEN?.trim();
    if (expected && asaasAccessToken !== expected) {
      throw new UnauthorizedException();
    }
    return this.billingAsaas.handleAsaasWebhook(body ?? {});
  }
}
