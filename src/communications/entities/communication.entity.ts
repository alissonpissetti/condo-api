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
import { CommunicationStatus } from '../enums/communication-status.enum';
import { CommunicationAttachment } from './communication-attachment.entity';
import { CommunicationReadLink } from './communication-read-link.entity';
import { CommunicationRecipient } from './communication-recipient.entity';

@Entity('communications')
export class Communication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id', type: 'varchar', length: 36 })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ type: 'varchar', length: 512 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: CommunicationStatus;

  @Column({ name: 'created_by_user_id', type: 'varchar', length: 36 })
  createdByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: User;

  @Column({ name: 'sent_at', type: 'datetime', precision: 6, nullable: true })
  sentAt: Date | null;

  /** Último utilizador que executou envio ou reenvio (síndico / gestão). */
  @Column({ name: 'last_broadcast_user_id', type: 'varchar', length: 36, nullable: true })
  lastBroadcastUserId: string | null;

  @Column({ name: 'last_broadcast_user_name', type: 'varchar', length: 255, nullable: true })
  lastBroadcastUserName: string | null;

  /**
   * `units` = filtrar por `audience_unit_ids` (vazio = todas as unidades);
   * `groupings` = filtrar por `audience_grouping_ids` (vazio = todos os agrupamentos).
   */
  @Column({ name: 'audience_scope', type: 'varchar', length: 32, default: 'units' })
  audienceScope: string;

  /** JSON array de UUIDs de unidades; null ou `[]` = todas as unidades do condomínio. */
  @Column({ name: 'audience_unit_ids', type: 'text', nullable: true })
  audienceUnitIds: string | null;

  /** JSON array de UUIDs de agrupamentos; null ou `[]` = todos. Só usado se `audience_scope` = `groupings`. */
  @Column({ name: 'audience_grouping_ids', type: 'text', nullable: true })
  audienceGroupingIds: string | null;

  @Column({ name: 'channel_email_enabled', type: 'boolean', default: true })
  channelEmailEnabled: boolean;

  @Column({ name: 'channel_sms_enabled', type: 'boolean', default: true })
  channelSmsEnabled: boolean;

  @Column({ name: 'channel_whatsapp_enabled', type: 'boolean', default: false })
  channelWhatsappEnabled: boolean;

  /**
   * JSON: `[{ "userId": "…", "email": true, "sms": false, "whatsapp": true }]`.
   * Omite canal = usar valor global do informativo.
   */
  @Column({ name: 'recipient_delivery_prefs', type: 'text', nullable: true })
  recipientDeliveryPrefs: string | null;

  @OneToMany(() => CommunicationAttachment, (a) => a.communication)
  attachments: CommunicationAttachment[];

  @OneToMany(() => CommunicationRecipient, (r) => r.communication)
  recipients: CommunicationRecipient[];

  @OneToMany(() => CommunicationReadLink, (l) => l.communication)
  readLinks: CommunicationReadLink[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
