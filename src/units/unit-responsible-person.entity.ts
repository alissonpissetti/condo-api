import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Person } from '../people/person.entity';
import { Unit } from './unit.entity';

@Entity('unit_responsible_people')
@Unique('UQ_urp_unit_person', ['unitId', 'personId'])
export class UnitResponsiblePerson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @ManyToOne(() => Unit, (u) => u.responsibleLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @Column({ name: 'person_id' })
  personId: string;

  @ManyToOne(() => Person, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'person_id' })
  person: Person;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
