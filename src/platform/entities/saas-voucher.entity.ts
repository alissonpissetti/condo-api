import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Catálogo de vouchers: nome + código único; aplicado ao condomínio por código. */
@Entity('saas_vouchers')
export class SaasVoucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  /** Normalizado em maiúsculas; único. */
  @Column({ type: 'varchar', length: 64, unique: true })
  code: string;

  /** 0–100. 100 = isenção total no período. */
  @Column({ name: 'discount_percent', type: 'int' })
  discountPercent: number;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date' })
  validTo: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
