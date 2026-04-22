import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import type { AllocationRule } from '../allocation.types';
import { FinancialFund } from './financial-fund.entity';

export type FinancialRecurrenceFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'semiannual'
  | 'yearly';

export type FinancialRecurrenceEndMode = 'never' | 'count' | 'until';

export type FinancialRecurrenceCompetencyAlign =
  | 'same_as_occurrence'
  | 'month_start';

@Entity('financial_transaction_recurrences')
export class FinancialTransactionRecurrence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ type: 'varchar', length: 16 })
  kind: 'expense' | 'income';

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents: string;

  @Column({ name: 'fund_id', nullable: true })
  fundId: string | null;

  @ManyToOne(() => FinancialFund, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'fund_id' })
  fund: FinancialFund | null;

  @Column({ name: 'allocation_rule', type: 'json' })
  allocationRule: AllocationRule;

  @Column({ type: 'varchar', length: 24 })
  frequency: FinancialRecurrenceFrequency;

  @Column({ name: 'end_mode', type: 'varchar', length: 16 })
  endMode: FinancialRecurrenceEndMode;

  @Column({ name: 'occurrences_limit', type: 'int', nullable: true })
  occurrencesLimit: number | null;

  @Column({ name: 'run_until', type: 'date', nullable: true })
  runUntil: Date | null;

  @Column({ name: 'occurrences_created', type: 'int', default: 0 })
  occurrencesCreated: number;

  @Column({ name: 'next_occurrence_on', type: 'date' })
  nextOccurrenceOn: Date;

  @Column({
    name: 'competency_align',
    type: 'varchar',
    length: 32,
    default: 'same_as_occurrence',
  })
  competencyAlign: FinancialRecurrenceCompetencyAlign;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
