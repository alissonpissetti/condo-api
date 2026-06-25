import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { User } from '../../users/user.entity';
import { MaintenanceStatus } from '../enums/maintenance-status.enum';
import { CondominiumMaintenanceTimelineEntry } from './condominium-maintenance-timeline-entry.entity';

@Entity('condominium_maintenances')
export class CondominiumMaintenance {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'condominium_id', type: 'varchar', length: 36 })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ type: 'varchar', length: 512 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Local ou equipamento (ex.: portão eletrônico). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  /** Peças ou itens trocados (referência de garantia). */
  @Column({ name: 'replaced_parts', type: 'text', nullable: true })
  replacedParts: string | null;

  @Column({ name: 'supplier_id', type: 'varchar', length: 36, nullable: true })
  supplierId: string | null;

  @Column({ name: 'supplier_name', type: 'varchar', length: 255, nullable: true })
  supplierName: string | null;

  @Column({ type: 'varchar', length: 32 })
  status: MaintenanceStatus;

  @Column({ name: 'created_by_user_id', type: 'varchar', length: 36 })
  createdByUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => CondominiumMaintenanceTimelineEntry, (e) => e.maintenance)
  timelineEntries: CondominiumMaintenanceTimelineEntry[];
}
