import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { WorkBudgetStatus } from '../enums/work-budget-status.enum';
import { CondominiumSupplier } from './condominium-supplier.entity';
import { CondominiumWork } from './condominium-work.entity';

@Entity('condominium_work_budgets')
export class CondominiumWorkBudget {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'work_id', type: 'varchar', length: 36 })
  workId: string;

  @ManyToOne(() => CondominiumWork, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_id' })
  work: CondominiumWork;

  /** Cadastro de fornecedor (opcional); o nome fica denormalizado em `supplier_name`. */
  @Column({ name: 'supplier_id', type: 'varchar', length: 36, nullable: true })
  supplierId: string | null;

  @ManyToOne(() => CondominiumSupplier, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier: CondominiumSupplier | null;

  @Column({ name: 'supplier_name', type: 'varchar', length: 255 })
  supplierName: string;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: string | null;

  /** Visita do fornecedor agendada (opcional). */
  @Column({ name: 'scheduled_at', type: 'datetime', precision: 6, nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'varchar', length: 32 })
  status: WorkBudgetStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_user_id', type: 'varchar', length: 36 })
  createdByUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

}
