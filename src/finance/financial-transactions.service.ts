import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WorkTransactionLinkService } from '../condominium-works/work-transaction-link.service';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { isAllocationRule } from './allocation.types';
import { AllocationResolverService } from './allocation-resolver.service';
import { distributePositiveCents } from './distribute-cents';
import { BulkAssignWorkDto } from './dto/bulk-assign-work.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { SettleTransactionDto } from './dto/settle-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpdateRecurringSeriesDto } from './dto/update-recurring-series.dto';
import {
  FinancialTransaction,
} from './entities/financial-transaction.entity';
import { FundMonthlyAccrual } from './entities/fund-monthly-accrual.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';
import { parseDateOnlyFromApi } from './date-only.util';
import { CondominiumBankAccountsService } from './condominium-bank-accounts.service';
import { FinancialFundsService } from './financial-funds.service';
import { FundBalanceService } from './fund-balance.service';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';

@Injectable()
export class FinancialTransactionsService {
  constructor(
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    @InjectRepository(FundMonthlyAccrual)
    private readonly fundAccrualRepo: Repository<FundMonthlyAccrual>,
    private readonly dataSource: DataSource,
    private readonly condominiumsService: CondominiumsService,
    private readonly allocationResolver: AllocationResolverService,
    private readonly fundsService: FinancialFundsService,
    private readonly fundBalance: FundBalanceService,
    private readonly bankAccounts: CondominiumBankAccountsService,
    @Inject(RECEIPT_STORAGE) private readonly storage: ReceiptStoragePort,
    private readonly workTxLink: WorkTransactionLinkService,
  ) {}

  private async isFundMonthlyAccrualTransaction(
    transactionId: string,
  ): Promise<boolean> {
    const n = await this.fundAccrualRepo.count({
      where: { transactionId },
    });
    return n > 0;
  }

  private async resolveBankAccountId(
    condominiumId: string,
    bankAccountId: string | undefined,
  ): Promise<string> {
    const id =
      bankAccountId?.trim() ||
      (await this.bankAccounts.resolvePrimaryAccountId(condominiumId));
    await this.bankAccounts.assertActiveInCondominium(condominiumId, id);
    return id;
  }

  async findAll(
    condominiumId: string,
    userId: string,
    fundId?: string,
    occurredFromYmd?: string,
    occurredToYmd?: string,
    workId?: string,
  ): Promise<Array<FinancialTransaction & { runningBalanceCents?: string }>> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const fromTrim = occurredFromYmd?.trim();
    const toTrim = occurredToYmd?.trim();
    if (fromTrim && toTrim && fromTrim > toTrim) {
      throw new BadRequestException(
        'Período inválido: a data inicial não pode ser posterior à data final.',
      );
    }
    const qb = this.txRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fund', 'fund')
      .leftJoinAndSelect('t.bankAccount', 'bankAccount')
      .leftJoinAndSelect('t.work', 'work')
      .leftJoinAndSelect('t.unitShares', 'shares')
      .leftJoinAndSelect('shares.unit', 'unit')
      .where('t.condominium_id = :condominiumId', { condominiumId })
      .orderBy('t.occurred_on', 'DESC')
      .addOrderBy('t.created_at', 'DESC');
    if (fundId) {
      qb.andWhere('t.fund_id = :fundId', { fundId });
    }
    const workFilter = workId?.trim();
    if (workFilter) {
      await this.workTxLink.assertWorkInCondominium(condominiumId, workFilter);
      qb.andWhere('t.work_id = :workId', { workId: workFilter });
    }
    if (fromTrim) {
      qb.andWhere('t.occurred_on >= :occurredFrom', {
        occurredFrom: parseDateOnlyFromApi(fromTrim),
      });
    }
    if (toTrim) {
      qb.andWhere('t.occurred_on <= :occurredTo', {
        occurredTo: parseDateOnlyFromApi(toTrim),
      });
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
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const t = await this.txRepo.findOne({
      where: { id: transactionId, condominiumId },
      relations: {
        fund: true,
        bankAccount: true,
        work: true,
        unitShares: { unit: true },
      },
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
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    this.validateAllocationForKind(dto.kind, dto.allocationRule);
    if (!isAllocationRule(dto.allocationRule)) {
      throw new BadRequestException('Invalid allocation rule');
    }
    if (dto.fundId) {
      await this.fundsService.findOne(condominiumId, dto.fundId, userId);
    }
    const bankAccountId = await this.resolveBankAccountId(
      condominiumId,
      dto.bankAccountId,
    );
    if (dto.receiptStorageKey) {
      await this.storage.assertReceiptExists(
        condominiumId,
        dto.receiptStorageKey,
      );
    }
    if (dto.workId?.trim()) {
      await this.workTxLink.assertWorkInCondominium(condominiumId, dto.workId.trim());
    }
    const createDocumentKeys = this.resolveCreateDocumentKeys(dto);
    await this.assertDocumentKeysExist(condominiumId, createDocumentKeys);
    const unitIds = await this.allocationResolver.resolveUnitIds(
      condominiumId,
      dto.allocationRule,
    );
    const shares = this.buildShares(dto.kind, dto.amountCents, unitIds);
    const id = await this.persistTransaction(
      condominiumId,
      dto,
      shares,
      bankAccountId,
    );
    const saved = await this.findOne(condominiumId, id, userId);
    await this.workTxLink.syncAfterSave(condominiumId, userId, saved);
    return saved;
  }

  async bulkAssignWork(
    condominiumId: string,
    userId: string,
    dto: BulkAssignWorkDto,
  ): Promise<{ updated: number; skippedTransferIds: string[] }> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    return this.workTxLink.bulkAssign(
      condominiumId,
      userId,
      dto.transactionIds,
      dto.workId ?? null,
    );
  }

  /**
   * Transferência de saldo: despesa na conta/fundo de origem e receita no destino.
   * Não entra na taxa condominial (sem rateio por unidade); quitada de imediato.
   */
  async createTransfer(
    condominiumId: string,
    userId: string,
    dto: CreateTransferDto,
  ): Promise<{
    transferGroupId: string;
    outTransaction: FinancialTransaction;
    inTransaction: FinancialTransaction;
  }> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);

    const fromBankAccountId = await this.resolveBankAccountId(
      condominiumId,
      dto.fromBankAccountId,
    );
    const toBankAccountId = await this.resolveBankAccountId(
      condominiumId,
      dto.toBankAccountId,
    );

    const fromFundId = dto.fromFundId?.trim() || null;
    const toFundId = dto.toFundId?.trim() || null;

    if (
      fromBankAccountId === toBankAccountId &&
      (fromFundId ?? '') === (toFundId ?? '')
    ) {
      throw new BadRequestException(
        fromFundId || toFundId
          ? 'Na mesma conta bancária, escolha fundos de origem e destino diferentes.'
          : 'Escolha contas de origem e destino diferentes (pode ser o mesmo banco, ex.: investimento → corrente).',
      );
    }

    if (fromFundId) {
      await this.fundsService.findOne(condominiumId, fromFundId, userId);
    }
    if (toFundId) {
      await this.fundsService.findOne(condominiumId, toFundId, userId);
    }

    const fromAcc = await this.bankAccounts.findOneInCondominium(
      condominiumId,
      fromBankAccountId,
    );
    const toAcc = await this.bankAccounts.findOneInCondominium(
      condominiumId,
      toBankAccountId,
    );

    const fromLabel = this.bankAccountLabel(fromAcc);
    const toLabel = this.bankAccountLabel(toAcc);
    const title =
      dto.title?.trim() ||
      `Transferência: ${fromLabel} → ${toLabel}`;
    const description = dto.description?.trim() || null;

    const occurredOn = parseDateOnlyFromApi(dto.occurredOn);
    const transferGroupId = randomUUID();
    const noneRule = { kind: 'none' as const };
    const amountCents = String(dto.amountCents);

    const result = await this.dataSource.transaction(async (manager) => {
      const outTx = manager.create(FinancialTransaction, {
        condominiumId,
        fundId: fromFundId,
        bankAccountId: fromBankAccountId,
        kind: 'expense',
        amountCents,
        occurredOn,
        competencyOn: occurredOn,
        title,
        description,
        allocationRule: noneRule,
        paymentStatus: 'paid',
        transferGroupId,
      });
      const savedOut = await manager.save(outTx);

      const inTx = manager.create(FinancialTransaction, {
        condominiumId,
        fundId: toFundId,
        bankAccountId: toBankAccountId,
        kind: 'income',
        amountCents,
        occurredOn,
        competencyOn: occurredOn,
        title,
        description,
        allocationRule: noneRule,
        paymentStatus: 'paid',
        transferGroupId,
        transferCounterpartId: savedOut.id,
      });
      const savedIn = await manager.save(inTx);

      savedOut.transferCounterpartId = savedIn.id;
      await manager.save(savedOut);

      return { savedOut, savedIn };
    });

    const outTransaction = await this.findOne(
      condominiumId,
      result.savedOut.id,
      userId,
    );
    const inTransaction = await this.findOne(
      condominiumId,
      result.savedIn.id,
      userId,
    );
    return { transferGroupId, outTransaction, inTransaction };
  }

  private bankAccountLabel(acc: {
    name: string;
    bankName?: string | null;
  }): string {
    const name = acc.name?.trim() || '—';
    const bank = acc.bankName?.trim();
    return bank ? `${name} (${bank})` : name;
  }

  /**
   * Cria transação sem verificação de utilizador (fechamento automático / jobs).
   * Valida fundo e regra de alocação como em `create`.
   */
  async createInternal(
    condominiumId: string,
    dto: CreateTransactionDto,
    opts?: {
      recurrenceId?: string;
      /** Por defeito `pending`; mensalidade automática de fundo usa `paid`. */
      paymentStatus?: 'pending' | 'paid';
    },
  ): Promise<FinancialTransaction> {
    this.validateAllocationForKind(dto.kind, dto.allocationRule);
    if (!isAllocationRule(dto.allocationRule)) {
      throw new BadRequestException('Invalid allocation rule');
    }
    if (dto.fundId) {
      await this.fundsService.findOneInCondominium(condominiumId, dto.fundId);
    }
    const bankAccountId = await this.resolveBankAccountId(
      condominiumId,
      dto.bankAccountId,
    );
    if (dto.receiptStorageKey) {
      await this.storage.assertReceiptExists(
        condominiumId,
        dto.receiptStorageKey,
      );
    }
    const createDocumentKeys = this.resolveCreateDocumentKeys(dto);
    await this.assertDocumentKeysExist(condominiumId, createDocumentKeys);
    const unitIds = await this.allocationResolver.resolveUnitIds(
      condominiumId,
      dto.allocationRule,
    );
    const shares = this.buildShares(dto.kind, dto.amountCents, unitIds);
    const id = await this.persistTransaction(
      condominiumId,
      dto,
      shares,
      bankAccountId,
      opts,
    );
    const t = await this.txRepo.findOne({
      where: { id, condominiumId },
      relations: { fund: true, bankAccount: true, unitShares: { unit: true } },
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
    if (existing.transferGroupId) {
      throw new BadRequestException(
        'Transferências não podem ser editadas; exclua o par e registre novamente.',
      );
    }
    const isFundAccrual = await this.isFundMonthlyAccrualTransaction(existing.id);
    if (isFundAccrual) {
      const structural =
        dto.kind !== undefined ||
        dto.amountCents !== undefined ||
        dto.occurredOn !== undefined ||
        dto.title !== undefined ||
        dto.description !== undefined ||
        dto.fundId !== undefined ||
        dto.bankAccountId !== undefined ||
        dto.allocationRule !== undefined;
      if (structural) {
        throw new BadRequestException(
          'Mensalidade automática de fundo não pode ser alterada manualmente. Ajuste o fundo em Fundos ou use «Regenerar cobranças» na taxa condominial (só apaga mensalidades ainda aguardando quitação).',
        );
      }
    }
    if (existing.paymentStatus === 'cancelled') {
      throw new BadRequestException('Cancelled transactions cannot be edited');
    }
    if (existing.paymentStatus === 'paid') {
      const restricted =
        dto.kind !== undefined ||
        dto.amountCents !== undefined ||
        dto.occurredOn !== undefined ||
        dto.title !== undefined ||
        dto.description !== undefined ||
        dto.fundId !== undefined ||
        dto.bankAccountId !== undefined ||
        dto.allocationRule !== undefined;
      if (restricted) {
        throw new BadRequestException(
          'Paid transactions can only change attachments; reopen settlement to edit',
        );
      }
    }
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
    let bankAccountId = existing.bankAccountId;
    if (dto.bankAccountId !== undefined) {
      bankAccountId = await this.resolveBankAccountId(
        condominiumId,
        dto.bankAccountId,
      );
    } else if (!bankAccountId) {
      bankAccountId = await this.resolveBankAccountId(condominiumId, undefined);
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
    const prevDocKeys = this.getExistingDocumentKeys(existing);
    const hasDocPatch =
      dto.documentStorageKeys !== undefined ||
      dto.documentStorageKey !== undefined;
    const nextDocKeys = hasDocPatch
      ? this.resolveUpdateDocumentKeys(dto)
      : prevDocKeys;
    if (hasDocPatch) {
      await this.assertDocumentKeysExist(condominiumId, nextDocKeys);
      await this.deleteRemovedDocumentKeys(condominiumId, prevDocKeys, nextDocKeys);
    }
    if (dto.workId !== undefined) {
      this.workTxLink.assertNotTransfer(existing);
      if (dto.workId?.trim()) {
        await this.workTxLink.assertWorkInCondominium(
          condominiumId,
          dto.workId.trim(),
        );
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
      existing.bankAccountId = bankAccountId;
      existing.allocationRule = allocationRule;
      if (dto.receiptStorageKey !== undefined) {
        existing.receiptStorageKey = dto.receiptStorageKey;
      }
      if (hasDocPatch) {
        existing.documentStorageKeys = nextDocKeys.length ? nextDocKeys : null;
        existing.documentStorageKey = nextDocKeys[0] ?? null;
      }
      if (dto.workId !== undefined) {
        existing.workId = dto.workId?.trim() || null;
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
    const saved = await this.findOne(condominiumId, existing.id, userId);
    await this.workTxLink.syncAfterSave(condominiumId, userId, saved);
    return saved;
  }

  async remove(
    condominiumId: string,
    transactionId: string,
    userId: string,
  ): Promise<void> {
    const t = await this.findOne(condominiumId, transactionId, userId);
    if (t.transferGroupId) {
      await this.removeTransferPair(condominiumId, t, userId);
      return;
    }
    if (t.paymentStatus === 'paid') {
      throw new BadRequestException(
        'Cannot delete paid transaction; reopen settlement first',
      );
    }
    for (const key of this.getExistingDocumentKeys(t)) {
      await this.storage.deleteReceipt(condominiumId, key);
    }
    await this.storage.deleteReceipt(condominiumId, t.receiptStorageKey);
    await this.workTxLink.removeForTransactionId(transactionId);
    await this.txRepo.delete(transactionId);
  }

  private async removeTransferPair(
    condominiumId: string,
    t: FinancialTransaction,
    userId: string,
  ): Promise<void> {
    const groupId = t.transferGroupId!.trim();
    const legs = await this.txRepo.find({
      where: { condominiumId, transferGroupId: groupId },
    });
    if (legs.length === 0) {
      throw new NotFoundException('Transfer not found');
    }
    for (const leg of legs) {
      for (const key of this.getExistingDocumentKeys(leg)) {
        await this.storage.deleteReceipt(condominiumId, key);
      }
      await this.storage.deleteReceipt(condominiumId, leg.receiptStorageKey);
    }
    await this.txRepo.delete({ condominiumId, transferGroupId: groupId });
  }

  async removeRecurringSeries(
    condominiumId: string,
    seriesId: string,
    userId: string,
  ): Promise<{ deleted: number }> {
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const rows = await this.txRepo.find({
      where: { condominiumId, recurringSeriesId: seriesId },
      select: {
        id: true,
        receiptStorageKey: true,
        documentStorageKey: true,
        documentStorageKeys: true,
        paymentStatus: true,
      },
    });
    if (rows.length === 0) {
      throw new NotFoundException('Recurring series not found');
    }
    for (const r of rows) {
      if (r.paymentStatus === 'paid') {
        throw new BadRequestException(
          'Cannot delete series with paid transactions; reopen settlement first',
        );
      }
    }
    const keys = new Set<string>();
    for (const r of rows) {
      if (r.receiptStorageKey) {
        keys.add(r.receiptStorageKey);
      }
      for (const k of this.getExistingDocumentKeys(r)) {
        keys.add(k);
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
    await this.condominiumsService.findOneForManagement(condominiumId, userId);
    const hasPatch = [
      dto.kind,
      dto.titleBase,
      dto.description,
      dto.fundId,
      dto.bankAccountId,
      dto.allocationRule,
      dto.amountCents,
      dto.documentStorageKeys,
      dto.documentStorageKey,
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
    let seriesBankAccountId: string | undefined;
    if (dto.bankAccountId !== undefined) {
      seriesBankAccountId = await this.resolveBankAccountId(
        condominiumId,
        dto.bankAccountId,
      );
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
    for (const t of rows) {
      if (t.paymentStatus !== 'pending') {
        throw new BadRequestException(
          'Recurring series contains non-editable transactions',
        );
      }
    }

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
    const hasDocPatch =
      dto.documentStorageKeys !== undefined ||
      dto.documentStorageKey !== undefined;
    const seriesDocKeys = hasDocPatch ? this.resolveUpdateDocumentKeys(dto) : null;
    if (hasDocPatch) {
      await this.assertDocumentKeysExist(condominiumId, seriesDocKeys ?? []);
      const allCurrentKeys = new Set<string>();
      for (const t of rows) {
        for (const k of this.getExistingDocumentKeys(t)) {
          allCurrentKeys.add(k);
        }
      }
      for (const key of allCurrentKeys) {
        if (!(seriesDocKeys ?? []).includes(key)) {
          await this.storage.deleteReceipt(condominiumId, key);
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
        if (seriesBankAccountId !== undefined) {
          existing.bankAccountId = seriesBankAccountId;
        }
        if (dto.receiptStorageKey !== undefined) {
          existing.receiptStorageKey = dto.receiptStorageKey;
        }
        if (hasDocPatch) {
          existing.documentStorageKeys =
            seriesDocKeys && seriesDocKeys.length ? seriesDocKeys : null;
          existing.documentStorageKey = seriesDocKeys?.[0] ?? null;
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
      relations: { fund: true, bankAccount: true, unitShares: { unit: true } },
      order: { occurredOn: 'ASC', id: 'ASC' },
    });
  }

  async settlePayment(
    condominiumId: string,
    transactionId: string,
    userId: string,
    dto: SettleTransactionDto,
  ): Promise<FinancialTransaction> {
    const t = await this.findOne(condominiumId, transactionId, userId);
    if (t.paymentStatus !== 'pending') {
      throw new BadRequestException('Transaction is not pending settlement');
    }
    const key = dto.receiptStorageKey?.trim();
    if (key) {
      await this.storage.assertReceiptExists(condominiumId, key);
      if (t.receiptStorageKey && t.receiptStorageKey !== key) {
        await this.storage.deleteReceipt(condominiumId, t.receiptStorageKey);
      }
      t.receiptStorageKey = key;
    }
    t.paymentStatus = 'paid';
    await this.txRepo.save(t);
    const saved = await this.findOne(condominiumId, transactionId, userId);
    if (saved.workId) {
      await this.workTxLink.syncAfterSave(condominiumId, userId, saved);
    }
    return saved;
  }

  async cancelPaymentStatus(
    condominiumId: string,
    transactionId: string,
    userId: string,
  ): Promise<FinancialTransaction> {
    const t = await this.findOne(condominiumId, transactionId, userId);
    if (t.paymentStatus !== 'pending') {
      throw new BadRequestException(
        'Only pending transactions can be cancelled',
      );
    }
    t.paymentStatus = 'cancelled';
    await this.txRepo.save(t);
    const saved = await this.findOne(condominiumId, transactionId, userId);
    if (saved.workId) {
      await this.workTxLink.syncAfterSave(condominiumId, userId, saved);
    }
    return saved;
  }

  async reopenSettlement(
    condominiumId: string,
    transactionId: string,
    userId: string,
  ): Promise<FinancialTransaction> {
    const t = await this.findOne(condominiumId, transactionId, userId);
    if (t.paymentStatus !== 'paid') {
      throw new BadRequestException(
        'Only paid transactions can be reopened',
      );
    }
    t.paymentStatus = 'pending';
    await this.txRepo.save(t);
    const saved = await this.findOne(condominiumId, transactionId, userId);
    if (saved.workId) {
      await this.workTxLink.syncAfterSave(condominiumId, userId, saved);
    }
    return saved;
  }

  private resolveCreateDocumentKeys(dto: CreateTransactionDto): string[] {
    if (Array.isArray(dto.documentStorageKeys)) {
      return [...new Set(dto.documentStorageKeys.map((k) => k.trim()).filter(Boolean))];
    }
    if (dto.documentStorageKey?.trim()) {
      return [dto.documentStorageKey.trim()];
    }
    return [];
  }

  private resolveUpdateDocumentKeys(dto: {
    documentStorageKeys?: string[] | null;
    documentStorageKey?: string | null;
  }): string[] {
    if (dto.documentStorageKeys === null) {
      return [];
    }
    if (Array.isArray(dto.documentStorageKeys)) {
      return [...new Set(dto.documentStorageKeys.map((k) => k.trim()).filter(Boolean))];
    }
    if (dto.documentStorageKey === null) {
      return [];
    }
    if (dto.documentStorageKey?.trim()) {
      return [dto.documentStorageKey.trim()];
    }
    return [];
  }

  private getExistingDocumentKeys(t: Pick<FinancialTransaction, 'documentStorageKey' | 'documentStorageKeys'>): string[] {
    if (Array.isArray(t.documentStorageKeys) && t.documentStorageKeys.length) {
      return [...new Set(t.documentStorageKeys.map((k) => k.trim()).filter(Boolean))];
    }
    if (t.documentStorageKey?.trim()) {
      return [t.documentStorageKey.trim()];
    }
    return [];
  }

  private async assertDocumentKeysExist(
    condominiumId: string,
    keys: string[],
  ): Promise<void> {
    for (const key of keys) {
      await this.storage.assertReceiptExists(condominiumId, key);
    }
  }

  private async deleteRemovedDocumentKeys(
    condominiumId: string,
    before: string[],
    after: string[],
  ): Promise<void> {
    for (const key of before) {
      if (!after.includes(key)) {
        await this.storage.deleteReceipt(condominiumId, key);
      }
    }
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
    bankAccountId: string,
    opts?: {
      recurrenceId?: string;
      paymentStatus?: 'pending' | 'paid';
    },
  ): Promise<string> {
    const occurredOn = parseDateOnlyFromApi(dto.occurredOn);
    const competencyOn = dto.competencyOn
      ? parseDateOnlyFromApi(dto.competencyOn)
      : occurredOn;
    const documentKeys = this.resolveCreateDocumentKeys(dto);
    const paymentStatus = opts?.paymentStatus ?? 'pending';
    return this.dataSource.transaction(async (manager) => {
      const tx = manager.create(FinancialTransaction, {
        condominiumId,
        fundId: dto.fundId ?? null,
        bankAccountId,
        kind: dto.kind,
        amountCents: String(dto.amountCents),
        occurredOn,
        competencyOn,
        title: dto.title,
        description: dto.description ?? null,
        allocationRule: dto.allocationRule,
        documentStorageKeys: documentKeys.length ? documentKeys : null,
        documentStorageKey: documentKeys[0] ?? null,
        receiptStorageKey: dto.receiptStorageKey ?? null,
        recurringSeriesId: dto.recurringSeriesId ?? null,
        recurrenceId: opts?.recurrenceId ?? null,
        paymentStatus,
        workId: dto.workId?.trim() || null,
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
