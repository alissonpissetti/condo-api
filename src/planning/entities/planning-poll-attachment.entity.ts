import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { PlanningPoll } from './planning-poll.entity';

@Entity('planning_poll_attachments')
export class PlanningPollAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'poll_id', type: 'varchar', length: 36 })
  pollId: string;

  @ManyToOne(() => PlanningPoll, (p) => p.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: PlanningPoll;

  @Column({ name: 'storage_key' })
  storageKey: string;

  @Column({ name: 'original_filename' })
  originalFilename: string;

  @Column({ name: 'mime_type' })
  mimeType: string;

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
