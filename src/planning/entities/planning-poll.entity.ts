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
import { User } from '../../users/user.entity';
import { AssemblyType } from '../enums/assembly-type.enum';
import { PlanningPollStatus } from '../enums/planning-poll-status.enum';
import { PlanningPollAttachment } from './planning-poll-attachment.entity';
import { PlanningPollOption } from './planning-poll-option.entity';

@Entity('planning_polls')
export class PlanningPoll {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ name: 'opens_at', type: 'datetime', precision: 6 })
  opensAt: Date;

  @Column({ name: 'closes_at', type: 'datetime', precision: 6 })
  closesAt: Date;

  @Column({ type: 'varchar', length: 16 })
  status: PlanningPollStatus;

  @Column({ name: 'assembly_type', type: 'varchar', length: 16 })
  assemblyType: AssemblyType;

  @Column({ name: 'allow_multiple', type: 'boolean', default: false })
  allowMultiple: boolean;

  @Column({ name: 'decided_option_id', type: 'varchar', length: 36, nullable: true })
  decidedOptionId: string | null;

  @Column({ name: 'created_by_user_id' })
  createdByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: User;

  @OneToMany(() => PlanningPollOption, (o) => o.poll, { cascade: ['insert'] })
  options: PlanningPollOption[];

  @OneToMany(() => PlanningPollAttachment, (a) => a.poll)
  attachments: PlanningPollAttachment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
