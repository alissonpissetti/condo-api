import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Communication } from './communication.entity';

@Entity('communication_attachments')
export class CommunicationAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'communication_id', type: 'varchar', length: 36 })
  communicationId: string;

  @ManyToOne(() => Communication, (c) => c.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'communication_id' })
  communication: Communication;

  @Column({ name: 'storage_key', length: 512 })
  storageKey: string;

  @Column({ name: 'mime_type', length: 128 })
  mimeType: string;

  @Column({ name: 'original_filename', length: 500 })
  originalFilename: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'uploaded_by_user_id', type: 'varchar', length: 36 })
  uploadedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
