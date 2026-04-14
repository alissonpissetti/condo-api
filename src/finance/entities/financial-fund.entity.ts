import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import type { AllocationRule } from '../allocation.types';

@Entity('financial_funds')
export class FinancialFund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column()
  name: string;

  /** Taxa condominial contínua (ad aeternum) vs fundo em prestações */
  @Column({ name: 'is_permanent', default: false })
  isPermanent: boolean;

  @Column({ name: 'allocation_rule', type: 'json', nullable: true })
  allocationRule: AllocationRule | null;

  /** Débito mensal por unidade (centavos), só fundo permanente */
  @Column({
    name: 'permanent_monthly_debit_cents',
    type: 'bigint',
    nullable: true,
  })
  permanentMonthlyDebitCents: string | null;

  /** Total a arrecadar por unidade (centavos), fundo em prestações */
  @Column({
    name: 'term_total_per_unit_cents',
    type: 'bigint',
    nullable: true,
  })
  termTotalPerUnitCents: string | null;

  @Column({ name: 'term_installment_count', type: 'int', nullable: true })
  termInstallmentCount: number | null;

  /** Prestação mensal calculada (centavos), fundo em prestações */
  @Column({
    name: 'term_monthly_per_unit_cents',
    type: 'bigint',
    nullable: true,
  })
  termMonthlyPerUnitCents: string | null;

  /** Primeira mensalidade do parcelamento (AAAA-MM); só fundo em prestações */
  @Column({
    name: 'period_start_ym',
    type: 'varchar',
    length: 7,
    nullable: true,
  })
  periodStartYm: string | null;

  @Column({ name: 'period_end_ym', type: 'varchar', length: 7, nullable: true })
  periodEndYm: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
