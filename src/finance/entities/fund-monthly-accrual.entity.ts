import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  Column,
} from 'typeorm';
import { FinancialFund } from './financial-fund.entity';
import { FinancialTransaction } from './financial-transaction.entity';

@Entity('fund_monthly_accruals')
@Unique('UQ_fund_monthly_accrual_fund_ym', ['fundId', 'competenceYm'])
export class FundMonthlyAccrual {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'fund_id' })
  fundId: string;

  @ManyToOne(() => FinancialFund, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fund_id' })
  fund: FinancialFund;

  /** Competência AAAA-MM */
  @Column({ name: 'competence_ym', type: 'varchar', length: 7 })
  competenceYm: string;

  @Column({ name: 'transaction_id' })
  transactionId: string;

  @ManyToOne(() => FinancialTransaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: FinancialTransaction;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
