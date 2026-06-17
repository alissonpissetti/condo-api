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

export type CondominiumFeeSlipDeliveryAction =
  | 'pdf_transparency'
  | 'pdf_unit_slip'
  | 'whatsapp_sent'
  | 'whatsapp_skipped'
  | 'whatsapp_failed';

@Entity('condominium_fee_slip_delivery_logs')
@Index('IDX_fee_slip_delivery_condo_ym_at', [
  'condominiumId',
  'competenceYm',
  'createdAt',
])
export class CondominiumFeeSlipDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @Column({ name: 'competence_ym', type: 'varchar', length: 7 })
  competenceYm: string;

  @Column({ name: 'charge_id', type: 'varchar', length: 36, nullable: true })
  chargeId: string | null;

  @ManyToOne(() => CondominiumFeeCharge, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'charge_id' })
  charge: CondominiumFeeCharge | null;

  @Column({ name: 'unit_id', type: 'varchar', length: 36, nullable: true })
  unitId: string | null;

  @Column({
    name: 'unit_identifier',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  unitIdentifier: string | null;

  @Column({ name: 'actor_user_id' })
  actorUserId: string;

  @Column({ type: 'varchar', length: 32 })
  action: CondominiumFeeSlipDeliveryAction;

  @Column({ type: 'json', nullable: true })
  detail: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
