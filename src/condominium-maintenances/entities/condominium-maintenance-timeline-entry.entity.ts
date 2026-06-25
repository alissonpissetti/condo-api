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
import { User } from '../../users/user.entity';
import { MaintenanceTimelineKind } from '../enums/maintenance-timeline-kind.enum';
import { CondominiumMaintenanceTimelineAttachment } from './condominium-maintenance-timeline-attachment.entity';
import { CondominiumMaintenance } from './condominium-maintenance.entity';

@Entity('condominium_maintenance_timeline_entries')
export class CondominiumMaintenanceTimelineEntry {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'maintenance_id', type: 'varchar', length: 36 })
  maintenanceId: string;

  @ManyToOne(() => CondominiumMaintenance, (m) => m.timelineEntries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'maintenance_id' })
  maintenance: CondominiumMaintenance;

  @Column({ type: 'varchar', length: 16 })
  kind: MaintenanceTimelineKind;

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

  @OneToMany(() => CondominiumMaintenanceTimelineAttachment, (a) => a.entry)
  attachments: CondominiumMaintenanceTimelineAttachment[];
}
