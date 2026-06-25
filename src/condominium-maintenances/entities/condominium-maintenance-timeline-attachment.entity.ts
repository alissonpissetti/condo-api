import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { CondominiumMaintenanceTimelineEntry } from './condominium-maintenance-timeline-entry.entity';

@Entity('condominium_maintenance_timeline_attachments')
export class CondominiumMaintenanceTimelineAttachment {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'entry_id', type: 'varchar', length: 36 })
  entryId: string;

  @ManyToOne(() => CondominiumMaintenanceTimelineEntry, (e) => e.attachments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'entry_id' })
  entry: CondominiumMaintenanceTimelineEntry;

  @Column({ name: 'storage_key', type: 'varchar', length: 512 })
  storageKey: string;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 128 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
