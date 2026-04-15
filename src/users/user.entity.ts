import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SaasPlan } from '../platform/entities/saas-plan.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  /** E.164 BR (ex.: 5561999988888). Opcional; necessário para login por SMS. */
  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phone: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /** Administrador global da plataforma (painel SaaS / condo-adm). */
  @Column({ name: 'platform_admin', default: false })
  platformAdmin: boolean;

  @Column({ name: 'plan_id', nullable: true })
  planId: number | null;

  @ManyToOne(() => SaasPlan, (p) => p.users, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan: SaasPlan | null;
}
