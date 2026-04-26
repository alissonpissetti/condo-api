import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { isAllocationRule } from './allocation.types';
import { AllocationResolverService } from './allocation-resolver.service';
import { distributePositiveCents } from './distribute-cents';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpdateRecurringSeriesDto } from './dto/update-recurring-series.dto';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';
import { parseDateOnlyFromApi } from './date-only.util';
import { FinancialFundsService } from './financial-funds.service';
import { FundBalanceService } from './fund-balance.service';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';

@Injectable()
export class FinancialTransactionsService {
  constructor(
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    private readonly dataSource: DataSource,
    private readonly condominiumsService: CondominiumsService,
    private readonly allocationResolver: AllocationResolverService,
    private readonly fundsService: FinancialFundsService,
    private readonly fundBalance: FundBalanceService,
    @Inject(RECEIPT_STORAGE) private readonly storage: ReceiptStoragePort,
  ) {}

  async findAll(
    condominiumId: string,
    userId: string,
    fundId?: string,
  ): Promise<Array<FinancialTransaction & { runningBalanceCents?: string }>> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const qb = this.txRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fund', 'fund')
      .leftJoinAndSelect('t.unitShares', 'shares')
      .leftJoinAndSelect('shares.unit', 'unit')
      .where('t.condominium_id = :condominiumId', { condominiumId })
      .orderBy('t.occurred_on', 'DESC')
      .addOrderBy('t.created_at', 'DESC');
    if (fundId) {
      qb.andWhere('t.fund_id = :fundId', { fundId });
    }
    const list = await qb.getMany();
    if (!fundId?.trim()) {
      return list;
    }
    const afterById =
      await this.fundBalance.runningBalanceCentsByTransactionId(
        condominiumId,
        fundId.trim(),
        list,
      );
    for (const t of list) {
      const b = afterById.get(t.id);
      if (b !== undefined) {
        Object.assign(t, { runningBalanceCents: b });
      }
    }
    return list;
  }

  async findOne(
    condominiumId: string,
    transactionId: string,
    userId: string,
  ): Promise<FinancialTransaction> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const t = await this.txRepo.findOne({
      where: { id: transactionId, condominiumId },
      relations: { fund: true, unitShares: { unit: true } },
    });
    if (!t) {
      throw new NotFoundException('Transaction not found');
    }
    return t;
  }

  async create(
    condominiumId: string,
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<FinancialTransaction> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    this.validateAllocationForKind(dto.kind, dto.allocationRule);
    if (!isAllocationRule(dto.allocationRule)) {
      throw new BadRequestException('Invalid allocation rule');
    }
    if (dto.fundId) {
      await this.fundsService.findOne(condominiumId, dto.fundId, userId);
    }
    if (dto.receiptStorageKey) {
      await this.storage.assertReceiptExists(
        condominiumId,
        dto.receiptStorageKey,
      );
    }
    const unitIds = await this.allocationResolver.resolveUnitIds(
      condominiumId,
      dto.allocationRule,
    );
    const shares = this.buildShares(dto.kind, dto.amountCents, unitIds);
    const id = await this.persistTransaction(condominiumId, dto, shares);
    return this.findOne(condominiumId, id, userId);
  }

  /**
   * Cria transação sem `assertOwner` (fechamento automático / jobs).
   * Valida fundo e regra de alocação como em `create`.
   */
  async createInternal(
    condominiumId: string,
    dto: CreateTransactionDto,
    opts?: { recurrenceId?: string },
  ): Promise<FinancialTransaction> {
    this.validateAllocationForKind(dto.kind, dto.allocationRule);
    if (!isAllocationRule(dto.allocationRule)) {
      throw new BadRequestException('Invalid allocation rule');
    }
    if (dto.fundId) {
      await this.fundsService.findOneInCondominium(condominiumId, dto.fundId);
    }
    const unitIds = await this.allocationResolver.resolveUnitIds(
      condominiumId,
      dto.allocationRule,
    );
    const shares = this.buildShares(dto.kind, dto.amountCents, unitIds);
    const id = await this.persistTransaction(condominiumId, dto, shares, opts);
    const t = await this.txRepo.findOne({
      where: { id, condominiumId },
      relations: { fund: true, unitShares: { unit: true } },
    });
    if (!t) {
      throw new NotFoundException('Transaction not found');
    }
    return t;
  }

  async update(
    condominiumId: string,
    transactionId: string,
    userId: string,
    dto: UpdateTransactionDto,
  ): Promise<FinancialTransaction> {
    const existing = await this.findOne(condominiumId, transactionId, userId);
    const kind = dto.kind ?? existing.kind;
    const amountCents = dto.amountCents ?? Number(existing.amountCents);
    const allocationRule = dto.allocationRule ?? existing.allocationRule;
    if (dto.allocationRule !== undefined && !isAllocationRule(allocationRule)) {
      throw new BadRequestException('Invalid allocation rule');
    }
    this.validateAllocationForKind(kind, allocationRule);
    if (dto.fundId !== undefined && dto.fundId !== null) {
      await this.fundsService.findOne(condominiumId, dto.fundId, userId);
    }
    if (dto.receiptStorageKey !== undefined) {
      if (dto.receiptStorageKey === null) {
        await this.storage.deleteReceipt(
          condominiumId,
          existing.receiptStorageKey,
        );
      } else {
        await this.storage.assertReceiptExists(
          condominiumId,
          dto.receiptStorageKey,
        );
        if (
          existing.receiptStorageKey &&
          existing.receiptStorageKey !== dto.receiptStorageKey
        ) {
          await this.storage.deleteReceipt(
            condominiumId,
            existing.receiptStorageKey,
          );
        }
      }
    }
    const unitIds = await this.allocationResolver.resolveUnitIds(
      condominiumId,
      allocationRule,
    );
    const shares = this.buildShares(kind, amountCents, unitIds);
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(TransactionUnitShare, {
        transactionId: existing.id,
      });
      existing.kind = kind;
      existing.amountCents = String(amountCents);
      if (dto.occurredOn) {
        const d = parseDateOnlyFromApi(dto.occurredOn);
        existing.occurredOn = d;
        existing.competencyOn = d;
      }
      existing.title = dto.title ?? existing.title;
      existing.description =
        dto.description !== undefined ? dto.description : existing.description;
      existing.fundId = dto.fundId !== undefined ? dto.fundId : existing.fundId;
      existing.allocationRule = allocationRule;
      if (dto.receiptStorageKey !== undefined) {
        existing.receiptStorageKey = dto.receiptStorageKey;
      }
      await manager.save(existing);
      for (const row of shares) {
        await manager.save(
          manager.create(TransactionUnitShare, {
            transactionId: existing.id,
            unitId: row.unitId,
            shareCents: row.shareCents,
          }),
        );
      }
    });
    return this.findOne(condominiumId, existing.id, userId);
  }

  async remove(
    condominiumId: string,
    transactionId: string,
    userId: string,
  ): Promise<void> {
    const t = await this.findOne(condominiumId, transactionId, userId);
    await this.storage.deleteReceipt(condominiumId, t.receiptStorageKey);
    await this.txRepo.delete(transactionId);
  }

  async removeRecurringSeries(
    condominiumId: string,
    seriesId: string,
    userId: string,
  ): Promise<{ deleted: number }> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const rows = await this.txRepo.find({
      where: { condominiumId, recurringSeriesId: seriesId },
      select: { id: true, receiptStorageKey: true },
    });
    if (rows.length === 0) {
      throw new NotFoundException('Recurring series not found');
    }
    const keys = new Set<string>();
    for (const r of rows) {
      if (r.receiptStorageKey) {
        keys.add(r.receiptStorageKey);
      }
    }
    for (const key of keys) {
      await this.storage.deleteReceipt(condominiumId, key);
    }
    await this.txRepo.delete({ condominiumId, recurringSeriesId: seriesId });
    return { deleted: rows.length };
  }

  async updateRecurringSeries(
    condominiumId: string,
    seriesId: string,
    userId: string,
    dto: UpdateRecurringSeriesDto,
  ): Promise<FinancialTransaction[]> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const hasPatch = [
      dto.kind,
      dto.titleBase,
      dto.description,
      dto.fundId,
      dto.allocationRule,
      dto.amountCents,
      dto.receiptStorageKey,
    ].some((v) => v !== undefined);
    if (!hasPatch) {
      throw new BadRequestException('Nada para atualizar na série');
    }
    if (
      dto.allocationRule !== undefined &&
      !isAllocationRule(dto.allocationRule)
    ) {
      throw new BadRequestException('Invalid allocation rule');
    }
    if (dto.fundId !== undefined && dto.fundId !== null) {
      await this.fundsService.findOne(condominiumId, dto.fundId, userId);
    }
    const rows = await this.txRepo.find({
      where: { condominiumId, recurringSeriesId: seriesId },
      relations: { unitShares: true },
      order: { occurredOn: 'ASC', id: 'ASC' },
    });
    if (rows.length === 0) {
      throw new NotFoundException('Recurring series not found');
    }
    const n = rows.length;

    if (dto.receiptStorageKey !== undefined) {
      if (dto.receiptStorageKey === null) {
        for (const t of rows) {
          await this.storage.deleteReceipt(condominiumId, t.receiptStorageKey);
        }
      } else {
        await this.storage.assertReceiptExists(
          condominiumId,
          dto.receiptStorageKey,
        );
        for (const t of rows) {
          if (
            t.receiptStorageKey &&
            t.receiptStorageKey !== dto.receiptStorageKey
          ) {
            await this.storage.deleteReceipt(
              condominiumId,
              t.receiptStorageKey,
            );
          }
        }
      }
    }

    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < rows.length; i++) {
        const existing = rows[i];
        const kind = dto.kind ?? existing.kind;
        const allocationRule = dto.allocationRule ?? existing.allocationRule;
        this.validateAllocationForKind(kind, allocationRule);
        const amountCents =
          dto.amountCents !== undefined
            ? dto.amountCents
            : Number(existing.amountCents);
        const unitIds = await this.allocationResolver.resolveUnitIds(
          condominiumId,
          allocationRule,
        );
        const shares = this.buildShares(kind, amountCents, unitIds);
        await manager.delete(TransactionUnitShare, {
          transactionId: existing.id,
        });
        existing.kind = kind;
        existing.amountCents = String(amountCents);
        existing.allocationRule = allocationRule;
        if (dto.titleBase !== undefined) {
          existing.title =
            n > 1 ? `${dto.titleBase} (${i + 1}/${n})` : dto.titleBase;
        }
        if (dto.description !== undefined) {
          existing.description = dto.description;
        }
        if (dto.fundId !== undefined) {
          existing.fundId = dto.fundId;
        }
        if (dto.receiptStorageKey !== undefined) {
          existing.receiptStorageKey = dto.receiptStorageKey;
        }
        await manager.save(existing);
        for (const row of shares) {
          await manager.save(
            manager.create(TransactionUnitShare, {
              transactionId: existing.id,
              unitId: row.unitId,
              shareCents: row.shareCents,
            }),
          );
        }
      }
    });

    return this.txRepo.find({
      where: { condominiumId, recurringSeriesId: seriesId },
      relations: { fund: true, unitShares: { unit: true } },
      order: { occurredOn: 'ASC', id: 'ASC' },
    });
  }

  private validateAllocationForKind(
    kind: 'expense' | 'income' | 'investment',
    rule: { kind: string },
  ): void {
    if ((kind === 'expense' || kind === 'investment') && rule.kind === 'none') {
      throw new BadRequestException(
        'Expense and investment transactions require an allocation rule',
      );
    }
  }

  private buildShares(
    kind: 'expense' | 'income' | 'investment',
    amountCents: number,
    unitIds: string[],
  ): { unitId: string; shareCents: string }[] {
    if (unitIds.length === 0) {
      if (kind === 'expense' || kind === 'investment') {
        throw new BadRequestException(
          'Expense and investment transactions require at least one unit in allocation',
        );
      }
      return [];
    }
    const total = BigInt(amountCents);
    const parts = distributePositiveCents(total, unitIds.length);
    const sign = kind === 'income' ? -1n : 1n;
    return unitIds.map((unitId, i) => ({
      unitId,
      shareCents: (parts[i] * sign).toString(),
    }));
  }

  private async persistTransaction(
    condominiumId: string,
    dto: CreateTransactionDto,
    shares: { unitId: string; shareCents: string }[],
    opts?: { recurrenceId?: string },
  ): Promise<string> {
    const occurredOn = parseDateOnlyFromApi(dto.occurredOn);
    const competencyOn = dto.competencyOn
      ? parseDateOnlyFromApi(dto.competencyOn)
      : occurredOn;
    return this.dataSource.transaction(async (manager) => {
      const tx = manager.create(FinancialTransaction, {
        condominiumId,
        fundId: dto.fundId ?? null,
        kind: dto.kind,
        amountCents: String(dto.amountCents),
        occurredOn,
        competencyOn,
        title: dto.title,
        description: dto.description ?? null,
        allocationRule: dto.allocationRule,
        receiptStorageKey: dto.receiptStorageKey ?? null,
        recurringSeriesId: dto.recurringSeriesId ?? null,
        recurrenceId: opts?.recurrenceId ?? null,
      });
      const saved = await manager.save(tx);
      for (const row of shares) {
        await manager.save(
          manager.create(TransactionUnitShare, {
            transactionId: saved.id,
            unitId: row.unitId,
            shareCents: row.shareCents,
          }),
        );
      }
      return saved.id;
    });
  }
}
