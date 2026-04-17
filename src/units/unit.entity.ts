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
import { Grouping } from '../groupings/grouping.entity';
import { Person } from '../people/person.entity';
import type { UnitResponsiblePerson } from './unit-responsible-person.entity';

@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'grouping_id' })
  groupingId: string;

  @ManyToOne(() => Grouping, (g) => g.units, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'grouping_id' })
  grouping: Grouping;

  @Column()
  identifier: string;

  @Column({ type: 'varchar', nullable: true })
  floor: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'owner_person_id', nullable: true })
  ownerPersonId: string | null;

  @ManyToOne(() => Person, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_person_id' })
  ownerPerson: Person | null;

  /** Vários responsáveis por unidade (ex.: co-inquilinos). */
  @OneToMany('UnitResponsiblePerson', 'unit')
  responsibleLinks: UnitResponsiblePerson[];

  /** Rótulo livre (ex.: PDF transparência) quando não há proprietário na base. */
  @Column({ name: 'owner_display_name', type: 'varchar', length: 255, nullable: true })
  ownerDisplayName: string | null;

  /** Rótulo livre quando não há responsável identificado na base. */
  @Column({
    name: 'responsible_display_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  responsibleDisplayName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
