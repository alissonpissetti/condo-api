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
import { Condominium } from '../../condominiums/condominium.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import type { ConstructionProjectStatus } from '../construction-project-status';
import { ConstructionProjectUpdate } from './construction-project-update.entity';

@Entity('construction_projects')
export class ConstructionProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 24 })
  status: ConstructionProjectStatus;

  @Column({ name: 'started_on', type: 'date', nullable: true })
  startedOn: Date | null;

  @Column({ name: 'expected_end_on', type: 'date', nullable: true })
  expectedEndOn: Date | null;

  @Column({ name: 'completed_on', type: 'date', nullable: true })
  completedOn: Date | null;

  @Column({ name: 'supplier_id', type: 'varchar', length: 36, nullable: true })
  supplierId: string | null;

  @ManyToOne(() => Supplier, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier | null;

  @OneToMany(() => ConstructionProjectUpdate, (u) => u.project)
  updates: ConstructionProjectUpdate[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
