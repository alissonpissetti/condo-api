import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CondominiumFeeCharge } from './condominium-fee-charge.entity';

export type CondominiumFeeChargePaymentLogAction =
  | 'payment_reopened'
  | 'receipt_replaced';

@Entity('condominium_fee_charge_payment_logs')
@Index('IDX_fee_charge_payment_log_charge', ['chargeId'])
export class CondominiumFeeChargePaymentLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'charge_id' })
  chargeId: string;

  @ManyToOne(() => CondominiumFeeCharge, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'charge_id' })
  charge: CondominiumFeeCharge;

  @Column({ name: 'actor_user_id' })
  actorUserId: string;

  @Column({ type: 'varchar', length: 32 })
  action: CondominiumFeeChargePaymentLogAction;

  /**
   * Ex.: `payment_reopened` → paidAt, incomeTransactionId, paymentReceiptStorageKey, reason.
   * `receipt_replaced` → previousReceiptKey, newReceiptKey.
   */
  @Column({ type: 'json' })
  detail: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
