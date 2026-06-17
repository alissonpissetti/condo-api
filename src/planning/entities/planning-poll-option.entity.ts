import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PlanningPollQuestion } from './planning-poll-question.entity';
import { PlanningPoll } from './planning-poll.entity';

@Entity('planning_poll_options')
export class PlanningPollOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'poll_id' })
  pollId: string;

  @ManyToOne(() => PlanningPoll, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: PlanningPoll;

  @Column({ name: 'question_id' })
  questionId: string;

  @ManyToOne(() => PlanningPollQuestion, (q) => q.options, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'question_id' })
  question: PlanningPollQuestion;

  @Column()
  label: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
