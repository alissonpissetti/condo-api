import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Grouping } from '../groupings/grouping.entity';
import { Person } from '../people/person.entity';

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

  @Column({ name: 'responsible_person_id', nullable: true })
  responsiblePersonId: string | null;

  @ManyToOne(() => Person, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responsible_person_id' })
  responsiblePerson: Person | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
