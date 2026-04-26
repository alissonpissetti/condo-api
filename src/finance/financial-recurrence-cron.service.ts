import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { FinancialTransactionRecurrence } from './entities/financial-transaction-recurrence.entity';
import { FinancialTransactionsService } from './financial-transactions.service';
import {
  addRecurrenceOccurrence,
  competencyFromOccurred,
  parseUtcYmd,
  utcYmd,
} from './financial-recurrence.util';

function nextOccurrenceAsIso(d: Date | string): string {
  if (typeof d === 'string') {
    return d.length >= 10 ? d.slice(0, 10) : d;
  }
  return utcYmd(d);
}

@Injectable()
export class FinancialRecurrenceCronService {
  private readonly logger = new Logger(FinancialRecurrenceCronService.name);

  constructor(
    @InjectRepository(FinancialTransactionRecurrence)
    private readonly recurrenceRepo: Repository<FinancialTransactionRecurrence>,
    private readonly txService: FinancialTransactionsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runDueRecurrences(): Promise<void> {
    if (this.config.get<string>('RECURRENCE_CRON_ENABLED') === 'false') {
      return;
    }
    const today = utcYmd(new Date());
    const due = await this.recurrenceRepo
      .createQueryBuilder('r')
      .where('r.active = :active', { active: true })
      .andWhere('r.next_occurrence_on <= :today', { today })
      .getMany();

    for (const row of due) {
      try {
        await this.processRecurrence(row);
      } catch (err) {
        this.logger.error(
          `Recorrência ${row.id} condomínio=${row.condominiumId}: ${String(err)}`,
        );
      }
    }
  }

  private async processRecurrence(
    r: FinancialTransactionRecurrence,
  ): Promise<void> {
    const today = utcYmd(new Date());
    const nextStr = nextOccurrenceAsIso(r.nextOccurrenceOn);
    if (nextStr > today) {
      return;
    }
    const occurredOn = nextStr;
    const align = r.competencyAlign ?? 'same_as_occurrence';
    const competencyOn = competencyFromOccurred(parseUtcYmd(occurredOn), align);

    const dto: CreateTransactionDto = {
      kind: r.kind,
      amountCents: Number(r.amountCents),
      occurredOn,
      competencyOn,
      title: r.title,
      description: r.description ?? undefined,
      fundId: r.fundId ?? undefined,
      allocationRule: r.allocationRule,
    };

    await this.txService.createInternal(r.condominiumId, dto, {
      recurrenceId: r.id,
    });

    const fromDate = parseUtcYmd(occurredOn);
    const newNext = addRecurrenceOccurrence(fromDate, r.frequency);
    const newNextStr = utcYmd(newNext);

    r.occurrencesCreated += 1;
    r.nextOccurrenceOn = newNext;

    let active = r.active;
    if (
      r.endMode === 'count' &&
      r.occurrencesLimit != null &&
      r.occurrencesCreated >= r.occurrencesLimit
    ) {
      active = false;
    }
    if (r.endMode === 'until' && r.runUntil) {
      const untilStr = nextOccurrenceAsIso(r.runUntil);
      if (newNextStr > untilStr) {
        active = false;
      }
    }

    r.active = active;
    await this.recurrenceRepo.save(r);
  }
}
