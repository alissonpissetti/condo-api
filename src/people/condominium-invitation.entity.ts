import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { Unit } from '../units/unit.entity';
import { User } from '../users/user.entity';
import { Person } from './person.entity';

@Entity('condominium_invitations')
export class CondominiumInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'token_hash', length: 64, unique: true })
  tokenHash: string;

  /**
   * Token em claro (mesmo valor do link do e-mail). Só gestores autenticados listam convites;
   * necessário para permitir copiar o link no painel após o envio.
   */
  @Column({
    name: 'invite_token_plain',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  inviteTokenPlain: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  /** E.164 (ex.: 5561999988888) — convite enviado por WhatsApp (Twilio). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ name: 'person_id' })
  personId: string;

  @ManyToOne(() => Person, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'person_id' })
  person: Person;

  @Column({ name: 'unit_id' })
  unitId: string;

  @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @Column({ name: 'invited_by_user_id' })
  invitedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'invited_by_user_id' })
  invitedBy: User;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt: Date;

  @Column({
    name: 'consumed_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  consumedAt: Date | null;

  /**
   * Preenchido na aplicação com `new Date()` ao criar o convite (alinhado a `consumed_at`),
   * evitando divergência com `CURRENT_TIMESTAMP` só no MySQL (DATETIME sem fuso).
   */
  @Column({ name: 'created_at' })
  createdAt: Date;
}
