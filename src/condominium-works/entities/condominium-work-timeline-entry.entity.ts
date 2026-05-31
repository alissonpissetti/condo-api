import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { FinancialTransaction } from '../../finance/entities/financial-transaction.entity';
import { CondominiumWorkTimelineAttachment } from './condominium-work-timeline-attachment.entity';
import { User } from '../../users/user.entity';
import { WorkTimelineKind } from '../enums/work-timeline-kind.enum';
import { CondominiumWorkBudget } from './condominium-work-budget.entity';
import { CondominiumWork } from './condominium-work.entity';

@Entity('condominium_work_timeline_entries')
export class CondominiumWorkTimelineEntry {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'work_id', type: 'varchar', length: 36 })
  workId: string;

  @ManyToOne(() => CondominiumWork, (w) => w.timelineEntries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'work_id' })
  work: CondominiumWork;

  @Column({ type: 'varchar', length: 16 })
  kind: WorkTimelineKind;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ name: 'storage_key', type: 'varchar', length: 512, nullable: true })
  storageKey: string | null;

  @Column({
    name: 'original_filename',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  originalFilename: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 128, nullable: true })
  mimeType: string | null;

  @Column({ name: 'size_bytes', type: 'int', nullable: true })
  sizeBytes: number | null;

  @Column({ name: 'budget_id', type: 'varchar', length: 36, nullable: true })
  budgetId: string | null;

  @ManyToOne(() => CondominiumWorkBudget, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'budget_id' })
  budget: CondominiumWorkBudget | null;

  @Column({
    name: 'financial_transaction_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  financialTransactionId: string | null;

  @ManyToOne(() => FinancialTransaction, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'financial_transaction_id' })
  financialTransaction: FinancialTransaction | null;

  @Column({ name: 'author_user_id', type: 'varchar', length: 36 })
  authorUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_user_id' })
  author: User;

  @Column({ name: 'author_display_name', type: 'varchar', length: 255 })
  authorDisplayName: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => CondominiumWorkTimelineAttachment, (a) => a.entry)
  attachments: CondominiumWorkTimelineAttachment[];
}
