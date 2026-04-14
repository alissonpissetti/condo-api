import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PasswordResetChannel = 'email' | 'sms';

@Entity('password_reset_challenges')
@Index('IDX_password_reset_challenges_dest', ['channel', 'destination'])
export class PasswordResetChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  channel: PasswordResetChannel;

  /** Email normalizado (minúsculas) ou telefone E.164 BR */
  @Column({ length: 320 })
  destination: string;

  @Column({ name: 'code_hash', length: 255 })
  codeHash: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
