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
import { PlanningPollQuestion } from './planning-poll-question.entity';

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

  /** Rascunho da ata final (modo reunião / IA); a `body` permanece como pauta original. */
  @Column({ name: 'minutes_body', type: 'text', nullable: true })
  minutesBody: string | null;

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

  /** Data civil de competência da pauta (AAAA-MM-DD). */
  @Column({ name: 'competence_date', type: 'date' })
  competenceDate: string;

  @Column({ name: 'decided_option_id', type: 'varchar', length: 36, nullable: true })
  decidedOptionId: string | null;

  /** Parecer final quando a reunião foi inconclusiva (prorrogação ou cancelamento). */
  @Column({ name: 'final_opinion', type: 'text', nullable: true })
  finalOpinion: string | null;

  /** Quando preenchido, a pauta deixa de aparecer na lista padrão. */
  @Column({ name: 'archived_at', type: 'datetime', precision: 6, nullable: true })
  archivedAt: Date | null;

  @Column({ name: 'created_by_user_id' })
  createdByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: User;

  @OneToMany(() => PlanningPollQuestion, (q) => q.poll, { cascade: ['insert'] })
  questions: PlanningPollQuestion[];

  @OneToMany(() => PlanningPollAttachment, (a) => a.poll)
  attachments: PlanningPollAttachment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
