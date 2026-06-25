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
import { CondominiumMaintenanceTimelineEntry } from './entities/condominium-maintenance-timeline-entry.entity';
import { CondominiumMaintenance } from './entities/condominium-maintenance.entity';
import { MaintenanceTimelineKind } from './enums/maintenance-timeline-kind.enum';

@Injectable()
export class MaintenanceTransactionLinkService {
  constructor(
    @InjectRepository(CondominiumMaintenance)
    private readonly maintenanceRepo: Repository<CondominiumMaintenance>,
    @InjectRepository(CondominiumMaintenanceTimelineEntry)
    private readonly entryRepo: Repository<CondominiumMaintenanceTimelineEntry>,
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async assertMaintenanceInCondominium(
    condominiumId: string,
    maintenanceId: string,
  ): Promise<CondominiumMaintenance> {
    const row = await this.maintenanceRepo.findOne({
      where: { id: maintenanceId, condominiumId },
    });
    if (!row) {
      throw new NotFoundException('Manutenção não encontrada.');
    }
    return row;
  }

  assertNotTransfer(tx: FinancialTransaction): void {
    if (tx.transferGroupId?.trim()) {
      throw new BadRequestException(
        'Transferências entre contas não podem ser vinculadas a manutenções.',
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

  async syncAfterSave(
    condominiumId: string,
    userId: string,
    tx: FinancialTransaction,
  ): Promise<void> {
    const maintenanceId = tx.maintenanceId?.trim() || null;
    const existing = await this.entryRepo.findOne({
      where: { financialTransactionId: tx.id },
    });

    if (!maintenanceId) {
      if (existing) {
        await this.entryRepo.delete({ id: existing.id });
      }
      return;
    }

    await this.assertMaintenanceInCondominium(condominiumId, maintenanceId);
    const authorDisplayName = await this.resolveDisplayName(userId);
    const body = this.formatTransactionBody(tx);
    const createdAt = parseDateOnlyFromApi(formatDateOnlyYmdUtc(tx.occurredOn));

    if (existing) {
      const previousMaintenanceId = existing.maintenanceId;
      existing.maintenanceId = maintenanceId;
      existing.body = body;
      existing.authorUserId = userId;
      existing.authorDisplayName = authorDisplayName;
      existing.createdAt = createdAt;
      await this.entryRepo.save(existing);
      await this.touchMaintenance(maintenanceId);
      if (previousMaintenanceId !== maintenanceId) {
        await this.touchMaintenance(previousMaintenanceId);
      }
      return;
    }

    const entry = this.entryRepo.create({
      id: randomUUID(),
      maintenanceId,
      kind: MaintenanceTimelineKind.Transaction,
      body,
      financialTransactionId: tx.id,
      authorUserId: userId,
      authorDisplayName,
      storageKey: null,
      originalFilename: null,
      mimeType: null,
      sizeBytes: null,
    });
    entry.createdAt = createdAt;
    await this.entryRepo.save(entry);
    await this.touchMaintenance(maintenanceId);
  }

  async removeForTransactionId(transactionId: string): Promise<void> {
    const existing = await this.entryRepo.findOne({
      where: { financialTransactionId: transactionId },
    });
    if (!existing) {
      return;
    }
    const maintenanceId = existing.maintenanceId;
    await this.entryRepo.delete({ id: existing.id });
    await this.touchMaintenance(maintenanceId);
  }

  async bulkAssign(
    condominiumId: string,
    userId: string,
    transactionIds: string[],
    maintenanceId: string | null,
  ): Promise<{ updated: number; skippedTransferIds: string[] }> {
    const ids = [...new Set(transactionIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      throw new BadRequestException('Informe pelo menos uma transação.');
    }

    if (maintenanceId?.trim()) {
      await this.assertMaintenanceInCondominium(condominiumId, maintenanceId.trim());
    }

    const txs = await this.txRepo.find({
      where: { condominiumId, id: In(ids) },
    });
    if (txs.length !== ids.length) {
      throw new NotFoundException('Uma ou mais transações não foram encontradas.');
    }

    const skippedTransferIds: string[] = [];
    const targetMaintenanceId = maintenanceId?.trim() || null;
    let updated = 0;

    for (const tx of txs) {
      if (tx.transferGroupId?.trim()) {
        skippedTransferIds.push(tx.id);
        continue;
      }
      tx.maintenanceId = targetMaintenanceId;
      await this.txRepo.save(tx);
      await this.syncAfterSave(condominiumId, userId, tx);
      updated += 1;
    }

    return { updated, skippedTransferIds };
  }

  private async touchMaintenance(maintenanceId: string): Promise<void> {
    await this.maintenanceRepo.update(
      { id: maintenanceId },
      { updatedAt: new Date() },
    );
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
