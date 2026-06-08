import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PlanningPollOption } from './planning-poll-option.entity';
import { PlanningPoll } from './planning-poll.entity';

@Entity('planning_poll_questions')
export class PlanningPollQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'poll_id' })
  pollId: string;

  @ManyToOne(() => PlanningPoll, (p) => p.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: PlanningPoll;

  /** Enunciado / assunto desta deliberação. */
  @Column()
  title: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'allow_multiple', type: 'boolean', default: false })
  allowMultiple: boolean;

  @Column({ name: 'decided_option_id', type: 'varchar', length: 36, nullable: true })
  decidedOptionId: string | null;

  @OneToMany(() => PlanningPollOption, (o) => o.question, { cascade: ['insert'] })
  options: PlanningPollOption[];
}
