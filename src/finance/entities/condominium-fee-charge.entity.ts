import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { Unit } from '../../units/unit.entity';
import { FinancialTransaction } from './financial-transaction.entity';

export type CondominiumFeeChargeStatus = 'open' | 'paid';

@Entity('condominium_fee_charges')
@Unique('UQ_fee_charge_condo_ym_unit', [
  'condominiumId',
  'competenceYm',
  'unitId',
])
export class CondominiumFeeCharge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ name: 'competence_ym', type: 'varchar', length: 7 })
  competenceYm: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  /**
   * Valor devido após homogeneizar por tipo de unidade (máximo das cotas brutas
   * entre unidades com o mesmo nome de agrupamento normalizado; se o nome for
   * vazio, por `grouping_id`).
   */
  @Column({ name: 'amount_due_cents', type: 'bigint' })
  amountDueCents: string;

  @Column({ name: 'due_on', type: 'date' })
  dueOn: Date;

  @Column({ type: 'varchar', length: 16 })
  status: CondominiumFeeChargeStatus;

  @Column({ name: 'paid_at', type: 'date', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'income_transaction_id', nullable: true })
  incomeTransactionId: string | null;

  @ManyToOne(() => FinancialTransaction, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'income_transaction_id' })
  incomeTransaction: FinancialTransaction | null;

  /**
   * Chave (relativa) do comprovante de pagamento salvo no storage de
   * receipts. É opcional: ao quitar uma cobrança, o gestor pode anexar
   * uma imagem ou PDF do comprovante bancário.
   */
  @Column({
    name: 'payment_receipt_storage_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  paymentReceiptStorageKey: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
