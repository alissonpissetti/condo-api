import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { User } from '../../users/user.entity';
import { SaasPlan } from './saas-plan.entity';

export type SaasPlanChangeRequestStatus = 'pending' | 'approved' | 'rejected';

@Entity('saas_plan_change_request')
@Index(['condominiumId'])
@Index(['status'])
export class SaasPlanChangeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ name: 'from_plan_id', type: 'int', nullable: true })
  fromPlanId: number | null;

  @ManyToOne(() => SaasPlan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'from_plan_id' })
  fromPlan: SaasPlan | null;

  @Column({ name: 'requested_plan_id', type: 'int' })
  requestedPlanId: number;

  @ManyToOne(() => SaasPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_plan_id' })
  requestedPlan: SaasPlan;

  @Column({ name: 'requested_by_user_id' })
  requestedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requested_by_user_id' })
  requestedByUser: User;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status: SaasPlanChangeRequestStatus;

  @Column({ name: 'tenant_message', type: 'text', nullable: true })
  tenantMessage: string | null;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ name: 'decided_at', type: 'timestamp', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'decided_by_user_id', type: 'varchar', length: 36, nullable: true })
  decidedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'decided_by_user_id' })
  decidedByUser: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
