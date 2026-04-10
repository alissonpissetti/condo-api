import {
  BadRequestException,
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
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';
import { FinancialFundsService } from './financial-funds.service';

@Injectable()
export class FinancialTransactionsService {
  constructor(
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    private readonly dataSource: DataSource,
    private readonly condominiumsService: CondominiumsService,
    private readonly allocationResolver: AllocationResolverService,
    private readonly fundsService: FinancialFundsService,
  ) {}

  async findAll(
    condominiumId: string,
    userId: string,
    fundId?: string,
  ): Promise<FinancialTransaction[]> {
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
    return qb.getMany();
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
    const unitIds = await this.allocationResolver.resolveUnitIds(
      condominiumId,
      dto.allocationRule,
    );
    const shares = this.buildShares(dto.kind, dto.amountCents, unitIds);
    const id = await this.persistTransaction(condominiumId, dto, shares);
    return this.findOne(condominiumId, id, userId);
  }

  async update(
    condominiumId: string,
    transactionId: string,
    userId: string,
    dto: UpdateTransactionDto,
  ): Promise<FinancialTransaction> {
    const existing = await this.findOne(
      condominiumId,
      transactionId,
      userId,
    );
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
      existing.occurredOn = dto.occurredOn
        ? new Date(dto.occurredOn)
        : existing.occurredOn;
      existing.title = dto.title ?? existing.title;
      existing.description =
        dto.description !== undefined ? dto.description : existing.description;
      existing.fundId =
        dto.fundId !== undefined ? dto.fundId : existing.fundId;
      existing.allocationRule = allocationRule;
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
    await this.findOne(condominiumId, transactionId, userId);
    await this.txRepo.delete(transactionId);
  }

  private validateAllocationForKind(
    kind: 'expense' | 'income',
    rule: { kind: string },
  ): void {
    if (kind === 'expense' && rule.kind === 'none') {
      throw new BadRequestException(
        'Expense transactions require an allocation rule',
      );
    }
  }

  private buildShares(
    kind: 'expense' | 'income',
    amountCents: number,
    unitIds: string[],
  ): { unitId: string; shareCents: string }[] {
    if (unitIds.length === 0) {
      if (kind === 'expense') {
        throw new BadRequestException(
          'Expense transactions require at least one unit in allocation',
        );
      }
      return [];
    }
    const total = BigInt(amountCents);
    const parts = distributePositiveCents(total, unitIds.length);
    const sign = kind === 'expense' ? 1n : -1n;
    return unitIds.map((unitId, i) => ({
      unitId,
      shareCents: (parts[i] * sign).toString(),
    }));
  }

  private async persistTransaction(
    condominiumId: string,
    dto: CreateTransactionDto,
    shares: { unitId: string; shareCents: string }[],
  ): Promise<string> {
    return this.dataSource.transaction(async (manager) => {
      const tx = manager.create(FinancialTransaction, {
        condominiumId,
        fundId: dto.fundId ?? null,
        kind: dto.kind,
        amountCents: String(dto.amountCents),
        occurredOn: new Date(dto.occurredOn),
        title: dto.title,
        description: dto.description ?? null,
        allocationRule: dto.allocationRule,
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
