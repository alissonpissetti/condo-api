import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlatformBillingAsaasService } from './platform-billing-asaas.service';

/**
 * Gera mensalidades SaaS no calendário do condomínio (~10 dias antes do vencimento),
 * envia e-mail ao titular e suspende faturamento 5 dias após vencimento sem pagamento.
 * Desligado por omissão: SAAS_BILLING_DAILY_CRON_ENABLED=true.
 */
@Injectable()
export class PlatformSaasBillingDailyCronService {
  private readonly logger = new Logger(PlatformSaasBillingDailyCronService.name);

  constructor(
    private readonly billingAsaas: PlatformBillingAsaasService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async run(): Promise<void> {
    if (this.config.get<string>('SAAS_BILLING_DAILY_CRON_ENABLED') !== 'true') {
      return;
    }
    try {
      const r = await this.billingAsaas.runDailySubscriptionBillingCycle();
      if (
        r.suspendedCondominiums > 0 ||
        r.chargesCreated > 0 ||
        r.errors > 0
      ) {
        this.logger.log(
          `SaaS billing diário (${r.today}): suspensões=${r.suspendedCondominiums} novas_cobranças=${r.chargesCreated} ignorados=${r.skipped} erros=${r.errors}`,
        );
      }
    } catch (e) {
      this.logger.error(`SaaS billing diário falhou: ${String(e)}`);
    }
  }
}
