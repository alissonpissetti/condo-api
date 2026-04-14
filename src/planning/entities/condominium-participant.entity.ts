import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { Person } from '../../people/person.entity';
import { User } from '../../users/user.entity';
import { GovernanceRole } from '../enums/governance-role.enum';

@Entity('condominium_participants')
@Unique('UQ_condo_participant_user_role', ['condominiumId', 'userId', 'role'])
@Index('IDX_condo_participant_condo_role', ['condominiumId', 'role'])
export class CondominiumParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'person_id', type: 'varchar', length: 36, nullable: true })
  personId: string | null;

  @ManyToOne(() => Person, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'person_id' })
  person: Person | null;

  @Column({ type: 'varchar', length: 16 })
  role: GovernanceRole;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
