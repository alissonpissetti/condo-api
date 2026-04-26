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

export type FinancialTransactionKind = 'expense' | 'income' | 'investment';

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

  /**
   * expense | income | investment (aplicação de capital; rateio como despesa).
   * No saldo do fundo: receita soma; despesa e aplicação subtraem.
   */
  @Column({ type: 'varchar', length: 16 })
  kind: FinancialTransactionKind;

  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents: string;

  @Column({ name: 'occurred_on', type: 'date' })
  occurredOn: Date;

  /** Competência contábil (pode diferir de occurred_on, ex. recorrência «início do mês»). */
  @Column({ name: 'competency_on', type: 'date' })
  competencyOn: Date;

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

  /** Agrupa parcelas criadas em lote (mesmo UUID em todas as transações da série). */
  @Column({
    name: 'recurring_series_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  recurringSeriesId: string | null;

  /** Preenchido quando a linha é gerada por `FinancialTransactionRecurrence`. */
  @Column({ name: 'recurrence_id', type: 'varchar', length: 36, nullable: true })
  recurrenceId: string | null;

  @OneToMany(() => TransactionUnitShare, (s) => s.transaction)
  unitShares: TransactionUnitShare[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
