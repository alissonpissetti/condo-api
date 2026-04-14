import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PlanningPoll } from './planning-poll.entity';

@Entity('planning_poll_options')
export class PlanningPollOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'poll_id' })
  pollId: string;

  @ManyToOne(() => PlanningPoll, (p) => p.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: PlanningPoll;

  @Column()
  label: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
