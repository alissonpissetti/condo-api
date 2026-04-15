import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Grouping } from '../groupings/grouping.entity';
import { SaasPlan } from '../platform/entities/saas-plan.entity';
import { SaasVoucher } from '../platform/entities/saas-voucher.entity';

@Entity('condominiums')
export class Condominium {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column()
  name: string;

  /** Plano SaaS efectivo para faturação deste condomínio (sobrepor ao plano do titular). */
  @Column({ name: 'saas_plan_id', type: 'int', nullable: true })
  saasPlanId: number | null;

  @ManyToOne(() => SaasPlan, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'saas_plan_id' })
  saasPlan: SaasPlan | null;

  @Column({ name: 'saas_voucher_id', type: 'varchar', length: 36, nullable: true })
  saasVoucherId: string | null;

  @ManyToOne(() => SaasVoucher, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'saas_voucher_id' })
  saasVoucher: SaasVoucher | null;

  @OneToMany(() => Grouping, (g) => g.condominium)
  groupings: Grouping[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
