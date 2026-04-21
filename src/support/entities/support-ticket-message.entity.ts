import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { SupportTicket } from './support-ticket.entity';

@Entity('support_ticket_messages')
export class SupportTicketMessage {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'ticket_id', type: 'varchar', length: 36 })
  ticketId: string;

  @ManyToOne(() => SupportTicket, (t) => t.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: SupportTicket;

  @Column({ name: 'author_user_id', type: 'varchar', length: 36 })
  authorUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_user_id' })
  author: User;

  @Column({ name: 'from_platform_admin', type: 'boolean', default: false })
  fromPlatformAdmin: boolean;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
