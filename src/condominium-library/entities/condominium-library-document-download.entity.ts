import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { User } from '../../users/user.entity';
import { CondominiumLibraryDocument } from './condominium-library-document.entity';

@Entity('condominium_library_document_downloads')
export class CondominiumLibraryDocumentDownload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ name: 'document_id' })
  documentId: string;

  @ManyToOne(() => CondominiumLibraryDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: CondominiumLibraryDocument;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'downloaded_at' })
  downloadedAt: Date;
}
