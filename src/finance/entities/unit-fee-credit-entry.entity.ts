import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { Unit } from '../../units/unit.entity';
import { CondominiumBankAccount } from './condominium-bank-account.entity';
import { CondominiumFeeCharge } from './condominium-fee-charge.entity';
import { FinancialTransaction } from './financial-transaction.entity';

export type UnitFeeCreditEntryKind =
  | 'advance_payment'
  | 'credit_applied'
  | 'credit_restored'
  | 'expense_paid_by_unit'
  | 'expense_paid_by_unit_reversed';

@Entity('unit_fee_credit_entries')
export class UnitFeeCreditEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ name: 'unit_id' })
  unitId: string;

  @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  /**
   * Positivo aumenta o saldo de crédito da unidade; negativo consome crédito.
   */
  @Column({ name: 'signed_amount_cents', type: 'bigint' })
  signedAmountCents: string;

  @Column({ name: 'entry_kind', type: 'varchar', length: 32 })
  entryKind: UnitFeeCreditEntryKind;

  @Column({ type: 'text', nullable: true })
  justification: string | null;

  @Column({
    name: 'payment_receipt_storage_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  paymentReceiptStorageKey: string | null;

  @Column({ name: 'bank_account_id', nullable: true })
  bankAccountId: string | null;

  @ManyToOne(() => CondominiumBankAccount, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: CondominiumBankAccount | null;

  @Column({ name: 'charge_id', nullable: true })
  chargeId: string | null;

  @ManyToOne(() => CondominiumFeeCharge, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'charge_id' })
  charge: CondominiumFeeCharge | null;

  @Column({ name: 'financial_transaction_id', nullable: true })
  financialTransactionId: string | null;

  @ManyToOne(() => FinancialTransaction, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'financial_transaction_id' })
  financialTransaction: FinancialTransaction | null;

  @Column({ name: 'actor_user_id' })
  actorUserId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
