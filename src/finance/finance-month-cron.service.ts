import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { CondominiumFeesService } from './condominium-fees.service';
import { previousCalendarYmFromDate } from './finance-competence.util';

@Injectable()
export class FinanceMonthCronService {
  private readonly logger = new Logger(FinanceMonthCronService.name);

  constructor(
    private readonly condominiumsService: CondominiumsService,
    private readonly condominiumFeesService: CondominiumFeesService,
    private readonly config: ConfigService,
  ) {}

  /** Dia 1 de cada mês, 05:00 (servidor). Competência = mês civil anterior. */
  @Cron('0 5 1 * *')
  async runMonthClose(): Promise<void> {
    const flag = this.config.get<string>('FINANCE_MONTH_CRON_ENABLED');
    if (flag === 'false') {
      return;
    }
    const ym = previousCalendarYmFromDate(new Date());
    const ids = await this.condominiumsService.findAllCondominiumIds();
    for (const condominiumId of ids) {
      try {
        await this.condominiumFeesService.closeMonthInternal(condominiumId, ym);
      } catch (err) {
        this.logger.error(
          `Fechamento mensal falhou condomínio=${condominiumId} competência=${ym}: ${String(err)}`,
        );
      }
    }
  }
}
