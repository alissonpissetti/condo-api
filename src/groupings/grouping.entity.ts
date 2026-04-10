import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { Unit } from '../units/unit.entity';

@Entity('groupings')
export class Grouping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, (c) => c.groupings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column()
  name: string;

  @OneToMany(() => Unit, (u) => u.grouping)
  units: Unit[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
