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

@Entity('condominium_bank_accounts')
export class CondominiumBankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 255, nullable: true })
  bankName: string | null;

  /** Saldo de referência ao adotar o sistema ou conferir o caixa (centavos). */
  @Column({ name: 'initial_balance_cents', type: 'bigint' })
  initialBalanceCents: string;

  /** Data em que o saldo inicial foi conferido (movimentos anteriores não entram no saldo da conta). */
  @Column({ name: 'initial_balance_on', type: 'date' })
  initialBalanceOn: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
