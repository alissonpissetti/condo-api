import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { User } from '../../users/user.entity';
import { CommunicationStatus } from '../enums/communication-status.enum';
import { CommunicationAttachment } from './communication-attachment.entity';
import { CommunicationRecipient } from './communication-recipient.entity';

@Entity('communications')
export class Communication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id', type: 'varchar', length: 36 })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ type: 'varchar', length: 512 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: CommunicationStatus;

  @Column({ name: 'created_by_user_id', type: 'varchar', length: 36 })
  createdByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: User;

  @Column({ name: 'sent_at', type: 'datetime', precision: 6, nullable: true })
  sentAt: Date | null;

  @OneToMany(() => CommunicationAttachment, (a) => a.communication)
  attachments: CommunicationAttachment[];

  @OneToMany(() => CommunicationRecipient, (r) => r.communication)
  recipients: CommunicationRecipient[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
