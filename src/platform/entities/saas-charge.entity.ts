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

export type SaasChargeStatus =
  | 'pending'
  | 'confirmed'
  | 'overdue'
  | 'cancelled';

@Entity('saas_charge')
export class SaasCharge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  /** Formato YYYY-MM (mês de referência da mensalidade SaaS). */
  @Column({ name: 'reference_month', type: 'varchar', length: 7 })
  referenceMonth: string;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status: SaasChargeStatus;

  @Column({ name: 'asaas_payment_id', type: 'varchar', length: 64, nullable: true })
  asaasPaymentId: string | null;

  @Column({ name: 'invoice_url', type: 'text', nullable: true })
  invoiceUrl: string | null;

  @Column({ name: 'bank_slip_url', type: 'text', nullable: true })
  bankSlipUrl: string | null;

  @Column({ name: 'pix_qr_payload', type: 'text', nullable: true })
  pixQrPayload: string | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'raw_last_webhook_at', type: 'timestamp', nullable: true })
  rawLastWebhookAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
