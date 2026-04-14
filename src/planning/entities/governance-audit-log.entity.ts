import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { User } from '../../users/user.entity';

@Entity('governance_audit_logs')
export class GovernanceAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ length: 64 })
  action: string;

  @Column({ name: 'performed_by_user_id' })
  performedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'performed_by_user_id' })
  performedBy: User;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
