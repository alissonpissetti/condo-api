import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Unit } from '../../units/unit.entity';
import { User } from '../../users/user.entity';
import { PlanningPollQuestion } from './planning-poll-question.entity';
import { PlanningPoll } from './planning-poll.entity';

@Entity('planning_poll_abstentions')
@Unique('UQ_poll_unit_question_abstention', ['pollId', 'unitId', 'questionId'])
export class PlanningPollAbstention {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'poll_id' })
  pollId: string;

  @ManyToOne(() => PlanningPoll, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: PlanningPoll;

  @Column({ name: 'unit_id' })
  unitId: string;

  @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @Column({ name: 'question_id' })
  questionId: string;

  @ManyToOne(() => PlanningPollQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: PlanningPollQuestion;

  @Column({ name: 'recorded_by_user_id' })
  recordedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recorded_by_user_id' })
  recordedBy: User;

  @CreateDateColumn({ name: 'recorded_at' })
  recordedAt: Date;
}
