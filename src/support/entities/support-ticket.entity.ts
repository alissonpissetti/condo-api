import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { User } from '../../users/user.entity';
import { SupportTicketMessage } from './support-ticket-message.entity';
import { SupportTicketCategory } from '../enums/support-ticket-category.enum';
import { SupportTicketStatus } from '../enums/support-ticket-status.enum';

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Contexto opcional (ex.: erro num condomínio); null = pedido geral à plataforma. */
  @Column({ name: 'condominium_id', type: 'varchar', length: 36, nullable: true })
  condominiumId: string | null;

  @ManyToOne(() => Condominium, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium | null;

  @Column({ type: 'varchar', length: 24 })
  category: SupportTicketCategory;

  @Column({ type: 'varchar', length: 512 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 16, default: SupportTicketStatus.Open })
  status: SupportTicketStatus;

  /** Token secreto para o cliente abrir o chamado pelo link do e-mail (sem expor dados a terceiros). */
  @Column({ name: 'view_token', type: 'varchar', length: 64 })
  viewToken: string;

  @OneToMany(() => SupportTicketMessage, (m) => m.ticket)
  messages: SupportTicketMessage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
