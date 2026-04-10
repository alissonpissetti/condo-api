import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Unit } from '../units/unit.entity';
import { Person } from './person.entity';

@Entity('unit_invitations')
export class UnitInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'token_hash', length: 64, unique: true })
  tokenHash: string;

  @Column()
  email: string;

  @Column({ type: 'varchar', length: 11, nullable: true })
  cpf: string | null;

  @Column({ name: 'person_id' })
  personId: string;

  @ManyToOne(() => Person, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'person_id' })
  person: Person;

  @Column({ name: 'unit_id' })
  unitId: string;

  @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @Column({ name: 'as_owner', default: false })
  asOwner: boolean;

  @Column({ name: 'as_responsible', default: false })
  asResponsible: boolean;

  @Column({ name: 'invited_by_user_id' })
  invitedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'invited_by_user_id' })
  invitedBy: User;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt: Date;

  @Column({
    name: 'consumed_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
