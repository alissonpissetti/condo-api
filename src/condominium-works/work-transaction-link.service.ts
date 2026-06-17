import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { Person } from '../people/person.entity';
import { User } from '../users/user.entity';
import {
  formatDateOnlyYmdUtc,
  parseDateOnlyFromApi,
} from '../finance/date-only.util';
import { FinancialTransaction } from '../finance/entities/financial-transaction.entity';
import { CondominiumWorkTimelineEntry } from './entities/condominium-work-timeline-entry.entity';
import { CondominiumWork } from './entities/condominium-work.entity';
import { WorkTimelineKind } from './enums/work-timeline-kind.enum';

@Injectable()
export class WorkTransactionLinkService {
  constructor(
    @InjectRepository(CondominiumWork)
    private readonly workRepo: Repository<CondominiumWork>,
    @InjectRepository(CondominiumWorkTimelineEntry)
    private readonly entryRepo: Repository<CondominiumWorkTimelineEntry>,
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async assertWorkInCondominium(
    condominiumId: string,
    workId: string,
  ): Promise<CondominiumWork> {
    const work = await this.workRepo.findOne({
      where: { id: workId, condominiumId },
    });
    if (!work) {
      throw new NotFoundException('Obra não encontrada.');
    }
    return work;
  }

  assertNotTransfer(tx: FinancialTransaction): void {
    if (tx.transferGroupId?.trim()) {
      throw new BadRequestException(
        'Transferências entre contas não podem ser vinculadas a obras.',
      );
    }
  }

  formatTransactionBody(tx: FinancialTransaction): string {
    const kindLabel =
      tx.kind === 'income'
        ? 'Receita'
        : tx.kind === 'investment'
          ? 'Aplicação'
          : tx.kind === 'yield'
            ? 'Rendimento'
            : 'Despesa';
    const amount = (Number(tx.amountCents) / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    let status = '';
    if (tx.paymentStatus === 'paid') {
      status = ' · Quitada';
    } else if (tx.paymentStatus === 'cancelled') {
      status = ' · Cancelada';
    }
    return `${kindLabel} · ${tx.title.trim()} · ${amount}${status}`;
  }

  /** Sincroniza entrada na timeline após gravar `work_id` na transação. */
  async syncAfterSave(
    condominiumId: string,
    userId: string,
    tx: FinancialTransaction,
  ): Promise<void> {
    const workId = tx.workId?.trim() || null;
    const existing = await this.entryRepo.findOne({
      where: { financialTransactionId: tx.id },
    });

    if (!workId) {
      if (existing) {
        await this.entryRepo.delete({ id: existing.id });
      }
      return;
    }

    await this.assertWorkInCondominium(condominiumId, workId);
    const authorDisplayName = await this.resolveDisplayName(userId);
    const body = this.formatTransactionBody(tx);
    const createdAt = parseDateOnlyFromApi(formatDateOnlyYmdUtc(tx.occurredOn));

    if (existing) {
      const previousWorkId = existing.workId;
      existing.workId = workId;
      existing.body = body;
      existing.authorUserId = userId;
      existing.authorDisplayName = authorDisplayName;
      existing.createdAt = createdAt;
      await this.entryRepo.save(existing);
      await this.touchWork(workId);
      if (previousWorkId !== workId) {
        await this.touchWork(previousWorkId);
      }
      return;
    }

    const entry = this.entryRepo.create({
      id: randomUUID(),
      workId,
      kind: WorkTimelineKind.Transaction,
      body,
      financialTransactionId: tx.id,
      authorUserId: userId,
      authorDisplayName,
      budgetId: null,
      storageKey: null,
      originalFilename: null,
      mimeType: null,
      sizeBytes: null,
    });
    entry.createdAt = createdAt;
    await this.entryRepo.save(entry);
    await this.touchWork(workId);
  }

  async removeForTransactionId(transactionId: string): Promise<void> {
    const existing = await this.entryRepo.findOne({
      where: { financialTransactionId: transactionId },
    });
    if (!existing) {
      return;
    }
    const workId = existing.workId;
    await this.entryRepo.delete({ id: existing.id });
    await this.touchWork(workId);
  }

  async bulkAssign(
    condominiumId: string,
    userId: string,
    transactionIds: string[],
    workId: string | null,
  ): Promise<{ updated: number; skippedTransferIds: string[] }> {
    const ids = [...new Set(transactionIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      throw new BadRequestException('Informe pelo menos uma transação.');
    }

    if (workId?.trim()) {
      await this.assertWorkInCondominium(condominiumId, workId.trim());
    }

    const txs = await this.txRepo.find({
      where: { condominiumId, id: In(ids) },
    });
    if (txs.length !== ids.length) {
      throw new NotFoundException('Uma ou mais transações não foram encontradas.');
    }

    const skippedTransferIds: string[] = [];
    const targetWorkId = workId?.trim() || null;
    let updated = 0;

    for (const tx of txs) {
      if (tx.transferGroupId?.trim()) {
        skippedTransferIds.push(tx.id);
        continue;
      }
      tx.workId = targetWorkId;
      await this.txRepo.save(tx);
      await this.syncAfterSave(condominiumId, userId, tx);
      updated += 1;
    }

    return { updated, skippedTransferIds };
  }

  private async touchWork(workId: string): Promise<void> {
    await this.workRepo.update({ id: workId }, { updatedAt: new Date() });
  }

  private async resolveDisplayName(userId: string): Promise<string> {
    const person = await this.personRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const personName = person?.fullName?.trim();
    if (personName) {
      return personName.slice(0, 255);
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return (user?.email?.trim() || 'Usuário').slice(0, 255);
  }
}
