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
import { CondominiumWork } from '../../condominium-works/entities/condominium-work.entity';
import type { AllocationRule } from '../allocation.types';
import { CondominiumBankAccount } from './condominium-bank-account.entity';
import { FinancialFund } from './financial-fund.entity';
import { TransactionUnitShare } from './transaction-unit-share.entity';

export type FinancialTransactionKind =
  | 'expense'
  | 'income'
  | 'investment'
  | 'yield';

/** Quitação do lançamento (impacta inclusão na geração da taxa condominial). */
export type FinancialTransactionPaymentStatus =
  | 'pending'
  | 'paid'
  | 'cancelled';

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

  @Column({ name: 'bank_account_id', nullable: true })
  bankAccountId: string | null;

  @ManyToOne(() => CondominiumBankAccount, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: CondominiumBankAccount | null;

  /** Obra associada; quando preenchido, gera entrada na timeline da obra. */
  @Column({ name: 'work_id', type: 'varchar', length: 36, nullable: true })
  workId: string | null;

  @ManyToOne(() => CondominiumWork, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'work_id' })
  work: CondominiumWork | null;

  /**
   * expense | income | investment (aplicação de capital; rateio como despesa) |
   * yield (rendimento de aplicação; só altera saldo da conta bancária).
   * No saldo do fundo: receita soma; despesa e aplicação subtraem; rendimento não incide.
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

  /** Documento de suporte (boleto, contrato, acordo, print etc.). */
  @Column({
    name: 'document_storage_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  documentStorageKey: string | null;

  /** Documentos de suporte (boleto, contrato, acordo, print etc.). */
  @Column({
    name: 'document_storage_keys',
    type: 'json',
    nullable: true,
  })
  documentStorageKeys: string[] | null;

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

  /**
   * Par de transferência entre contas/fundos (duas linhas: saída + entrada).
   * Mesmo UUID nas duas pernas.
   */
  @Column({
    name: 'transfer_group_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  transferGroupId: string | null;

  /** ID da outra perna da transferência (saída ↔ entrada). */
  @Column({
    name: 'transfer_counterpart_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  transferCounterpartId: string | null;

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

  /**
   * `pending`: aguardando quitação (entra no rateio da taxa condominial da competência).
   * `paid`: quitado (não entra na taxa).
   * `cancelled`: cancelado / anulado (não entra na taxa nem nos saldos de fundo).
   */
  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 16,
    default: 'pending',
  })
  paymentStatus: FinancialTransactionPaymentStatus;

  @OneToMany(() => TransactionUnitShare, (s) => s.transaction)
  unitShares: TransactionUnitShare[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
