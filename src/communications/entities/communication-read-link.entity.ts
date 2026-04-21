import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CommunicationReadLinkChannel } from '../enums/communication-read-link-channel.enum';
import { Communication } from './communication.entity';

@Entity('communication_read_links')
@Index('IDX_crl_comm_user_unit_ch', [
  'communicationId',
  'userId',
  'unitId',
  'channel',
])
export class CommunicationReadLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'communication_id', type: 'varchar', length: 36 })
  communicationId: string;

  @ManyToOne(() => Communication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'communication_id' })
  communication: Communication;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ name: 'unit_id', type: 'varchar', length: 36 })
  unitId: string;

  @Column({ type: 'varchar', length: 16 })
  channel: CommunicationReadLinkChannel;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6, nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'consumed_at', type: 'datetime', precision: 6, nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
