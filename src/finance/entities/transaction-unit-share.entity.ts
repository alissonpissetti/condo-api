import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Unit } from '../../units/unit.entity';
import { FinancialTransaction } from './financial-transaction.entity';

@Entity('transaction_unit_shares')
export class TransactionUnitShare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id' })
  transactionId: string;

  @ManyToOne(() => FinancialTransaction, (t) => t.unitShares, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction: FinancialTransaction;

  @Column({ name: 'unit_id' })
  unitId: string;

  @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  /** Positivo = cobrança (despesa); negativo = crédito (receita repartida). */
  @Column({ name: 'share_cents', type: 'bigint' })
  shareCents: string;
}
