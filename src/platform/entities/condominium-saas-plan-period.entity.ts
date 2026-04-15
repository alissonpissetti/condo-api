import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { SaasPlan } from './saas-plan.entity';

/**
 * Histórico contínuo de planos: [validFrom, validTo) com validTo null = período aberto.
 * Usado para prorata da mensalidade SaaS por mês de referência (YYYY-MM).
 */
@Entity('condominium_saas_plan_period')
@Index(['condominiumId', 'validFrom'])
export class CondominiumSaasPlanPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ name: 'saas_plan_id', type: 'int' })
  saasPlanId: number;

  @ManyToOne(() => SaasPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'saas_plan_id' })
  saasPlan: SaasPlan;

  @Column({ name: 'valid_from', type: 'timestamp' })
  validFrom: Date;

  /** Fim exclusivo; null = ainda vigente. */
  @Column({ name: 'valid_to', type: 'timestamp', nullable: true })
  validTo: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
