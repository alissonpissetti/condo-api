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

export type SaasBillingStatus = 'active' | 'suspended';

@Entity('saas_condominium_billing')
export class SaasCondominiumBilling {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id', unique: true })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ name: 'monthly_amount_cents', type: 'int', default: 0 })
  monthlyAmountCents: number;

  @Column({ type: 'varchar', length: 3, default: 'BRL' })
  currency: string;

  @Column({ name: 'asaas_customer_id', type: 'varchar', length: 64, nullable: true })
  asaasCustomerId: string | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: SaasBillingStatus;

  /**
   * Dia do mês do vencimento (1–31), alinhado à data de entrada do condomínio.
   * Ciclo: geração ~10 dias antes; suspensão 5 dias após vencimento sem pagamento.
   */
  @Column({ name: 'billing_due_day', type: 'smallint', default: 1 })
  billingDueDay: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
