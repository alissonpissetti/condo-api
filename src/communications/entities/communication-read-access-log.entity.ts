import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { CommunicationReadLink } from './communication-read-link.entity';
import { Communication } from './communication.entity';

/** Cada abertura da página pública ou download de anexo com token válido. */
@Entity('communication_read_access_logs')
@Index('IDX_cral_comm_accessed', ['communicationId', 'accessedAt'])
export class CommunicationReadAccessLog {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'communication_id', type: 'varchar', length: 36 })
  communicationId: string;

  @ManyToOne(() => Communication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'communication_id' })
  communication: Communication;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  /** Nome na ficha (ou e-mail) no momento do acesso. */
  @Column({ name: 'reader_display_name', type: 'varchar', length: 255, nullable: true })
  readerDisplayName: string | null;

  @Column({ name: 'unit_id', type: 'varchar', length: 36, nullable: true })
  unitId: string | null;

  /** Canal do token (email, sms, whatsapp) ou `legacy_email` / `app` quando aplicável. */
  @Column({ type: 'varchar', length: 24 })
  channel: string;

  /** `public_view` = abrir página; `attachment_download` = ficheiro anexo. */
  @Column({ type: 'varchar', length: 24, default: 'public_view' })
  kind: string;

  @Column({ name: 'read_link_id', type: 'varchar', length: 36, nullable: true })
  readLinkId: string | null;

  @ManyToOne(() => CommunicationReadLink, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'read_link_id' })
  readLink: CommunicationReadLink | null;

  @Column({ name: 'accessed_at', type: 'datetime', precision: 6 })
  accessedAt: Date;
}
