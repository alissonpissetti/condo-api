import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import type { AllocationRule } from '../allocation.types';
import { FinancialFund } from './financial-fund.entity';
import { TransactionUnitShare } from './transaction-unit-share.entity';

export type FinancialTransactionKind = 'expense' | 'income';

@Entity('financial_transactions')
export class FinancialTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ name: 'fund_id', nullable: true })
  fundId: string | null;

  @ManyToOne(() => FinancialFund, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'fund_id' })
  fund: FinancialFund | null;

  @Column({ type: 'varchar', length: 16 })
  kind: FinancialTransactionKind;

  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents: string;

  @Column({ name: 'occurred_on', type: 'date' })
  occurredOn: Date;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Caminho relativo ao armazenamento do condomínio (ex.: receipts/uuid.pdf). */
  @Column({
    name: 'receipt_storage_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  receiptStorageKey: string | null;

  /** `json` é suportado por PostgreSQL e MySQL/MariaDB (`jsonb` só existe no PG). */
  @Column({ name: 'allocation_rule', type: 'json' })
  allocationRule: AllocationRule;

  @OneToMany(() => TransactionUnitShare, (s) => s.transaction)
  unitShares: TransactionUnitShare[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
