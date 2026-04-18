import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { DeliveryChannelStatus } from '../enums/delivery-channel-status.enum';
import { CommunicationReadSource } from '../enums/read-source.enum';
import { Communication } from './communication.entity';

@Entity('communication_recipients')
export class CommunicationRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'communication_id', type: 'varchar', length: 36 })
  communicationId: string;

  @ManyToOne(() => Communication, (c) => c.recipients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'communication_id' })
  communication: Communication;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'email_snapshot', type: 'varchar', length: 255, nullable: true })
  emailSnapshot: string | null;

  @Column({ name: 'phone_snapshot', type: 'varchar', length: 20, nullable: true })
  phoneSnapshot: string | null;

  @Column({ name: 'email_status', type: 'varchar', length: 16 })
  emailStatus: DeliveryChannelStatus;

  @Column({ name: 'sms_status', type: 'varchar', length: 16 })
  smsStatus: DeliveryChannelStatus;

  @Column({ name: 'email_error', type: 'text', nullable: true })
  emailError: string | null;

  @Column({ name: 'sms_error', type: 'text', nullable: true })
  smsError: string | null;

  @Column({ name: 'email_token_hash', type: 'varchar', length: 64, nullable: true })
  emailTokenHash: string | null;

  @Column({ name: 'email_token_expires_at', type: 'datetime', precision: 6, nullable: true })
  emailTokenExpiresAt: Date | null;

  @Column({ name: 'read_at', type: 'datetime', precision: 6, nullable: true })
  readAt: Date | null;

  @Column({ name: 'read_source', type: 'varchar', length: 16, nullable: true })
  readSource: CommunicationReadSource | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
