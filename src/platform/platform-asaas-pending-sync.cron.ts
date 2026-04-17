import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlatformBillingAsaasService } from './platform-billing-asaas.service';

/**
 * Quando o webhook Asaas falha, sincroniza cobranças pendentes consultando GET /payments/:id.
 * Desligado por omissão; ligue ASAAS_PENDING_SYNC_CRON_ENABLED=true.
 */
@Injectable()
export class PlatformAsaasPendingSyncCronService {
  private readonly logger = new Logger(PlatformAsaasPendingSyncCronService.name);

  constructor(
    private readonly billingAsaas: PlatformBillingAsaasService,
    private readonly config: ConfigService,
  ) {}

  /** A cada 2 horas, servidor. */
  @Cron(CronExpression.EVERY_2_HOURS)
  async run(): Promise<void> {
    if (this.config.get<string>('ASAAS_PENDING_SYNC_CRON_ENABLED') !== 'true') {
      return;
    }
    try {
      const r = await this.billingAsaas.syncPendingChargesFromAsaas();
      if (r.updated > 0 || r.errors.length > 0) {
        this.logger.log(
          `Asaas sync pendente: verificadas=${r.checked} atualizadas=${r.updated} erros=${r.errors.length}`,
        );
      }
    } catch (e) {
      this.logger.error(`Asaas sync pendente falhou: ${String(e)}`);
    }
  }
}
