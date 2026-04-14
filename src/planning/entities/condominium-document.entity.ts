import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { User } from '../../users/user.entity';
import { CondominiumDocumentKind } from '../enums/condominium-document-kind.enum';
import { CondominiumDocumentStatus } from '../enums/condominium-document-status.enum';
import { PlanningPoll } from './planning-poll.entity';

@Entity('condominium_documents')
export class CondominiumDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ type: 'varchar', length: 32 })
  kind: CondominiumDocumentKind;

  @Column({ type: 'varchar', length: 24 })
  status: CondominiumDocumentStatus;

  @Column({ length: 512 })
  title: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 512, nullable: true })
  storageKey: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 128, nullable: true })
  mimeType: string | null;

  @Column({ name: 'poll_id', type: 'varchar', length: 36, nullable: true })
  pollId: string | null;

  @ManyToOne(() => PlanningPoll, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'poll_id' })
  poll: PlanningPoll | null;

  @Column({ name: 'visible_to_all_residents', default: false })
  visibleToAllResidents: boolean;

  @Column({ name: 'created_by_user_id' })
  createdByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: User;

  @Column({ name: 'election_payload', type: 'json', nullable: true })
  electionPayload: {
    syndicUserId?: string;
    adminUserIds?: string[];
  } | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
