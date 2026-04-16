import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { formatDateOnlyYmdUtc } from './date-only.util';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';

export interface StatementByUnitRow {
  unitId: string;
  unitIdentifier: string;
  groupingName: string;
  balanceCents: string;
}

export interface StatementTransactionRow {
  id: string;
  kind: string;
  title: string;
  amountCents: string;
  occurredOn: string;
  fundId: string | null;
  fundName: string | null;
}

export interface StatementResult {
  from: string;
  to: string;
  byUnit: StatementByUnitRow[];
  transactions: StatementTransactionRow[];
}

@Injectable()
export class FinanceStatementService {
  constructor(
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    @InjectRepository(TransactionUnitShare)
    private readonly shareRepo: Repository<TransactionUnitShare>,
    private readonly condominiumsService: CondominiumsService,
  ) {}

  async statement(
    condominiumId: string,
    userId: string,
    from: string,
    to: string,
    fundId?: string,
  ): Promise<StatementResult> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        'Query parameters from and to are required (YYYY-MM-DD)',
      );
    }
    const fromD = new Date(from);
    const toD = new Date(to);
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    if (fromD > toD) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const fromStr = from.trim().slice(0, 10);
    const toStr = to.trim().slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fromStr) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toStr)
    ) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }

    const txQb = this.txRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fund', 'fund')
      .where('t.condominium_id = :cid', { cid: condominiumId })
      .andWhere('t.occurred_on >= :from', { from: fromStr })
      .andWhere('t.occurred_on <= :to', { to: toStr })
      .orderBy('t.occurred_on', 'DESC')
      .addOrderBy('t.created_at', 'DESC');
    if (fundId) {
      txQb.andWhere('t.fund_id = :fundId', { fundId });
    }
    const txList = await txQb.getMany();

    const shareQb = this.shareRepo
      .createQueryBuilder('s')
      .innerJoin('s.transaction', 't')
      .innerJoin('s.unit', 'u')
      .innerJoin('u.grouping', 'g')
      .where('t.condominium_id = :cid', { cid: condominiumId })
      .andWhere('t.occurred_on >= :from', { from: fromStr })
      .andWhere('t.occurred_on <= :to', { to: toStr })
      .select('u.id', 'unitId')
      .addSelect('u.identifier', 'unitIdentifier')
      .addSelect('g.name', 'groupingName')
      .addSelect('SUM(s.share_cents)', 'balanceCents')
      .groupBy('u.id')
      .addGroupBy('u.identifier')
      .addGroupBy('g.name')
      .orderBy('g.name', 'ASC')
      .addOrderBy('u.identifier', 'ASC');
    if (fundId) {
      shareQb.andWhere('t.fund_id = :fundId', { fundId });
    }
    const byUnitRaw = await shareQb.getRawMany();

    return {
      from: fromStr,
      to: toStr,
      byUnit: byUnitRaw.map((r) => ({
        unitId: r.unitId,
        unitIdentifier: r.unitIdentifier,
        groupingName: r.groupingName,
        balanceCents: String(r.balanceCents ?? '0'),
      })),
      transactions: txList.map((t) => ({
        id: t.id,
        kind: t.kind,
        title: t.title,
        amountCents: t.amountCents,
        occurredOn: formatDateOnlyYmdUtc(t.occurredOn),
        fundId: t.fundId,
        fundName: t.fund?.name ?? null,
      })),
    };
  }
}
