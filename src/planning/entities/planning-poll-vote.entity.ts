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
import { PlanningPollOption } from './planning-poll-option.entity';
import { PlanningPoll } from './planning-poll.entity';

@Entity('planning_poll_votes')
@Unique('UQ_poll_unit_vote', ['pollId', 'unitId'])
export class PlanningPollVote {
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

  @Column({ name: 'option_id' })
  optionId: string;

  @ManyToOne(() => PlanningPollOption, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'option_id' })
  option: PlanningPollOption;

  @Column({ name: 'cast_by_user_id' })
  castByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cast_by_user_id' })
  castBy: User;

  @CreateDateColumn({ name: 'cast_at' })
  castAt: Date;
}
