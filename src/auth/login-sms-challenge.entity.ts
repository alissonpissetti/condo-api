import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('login_sms_challenges')
@Index('IDX_login_sms_challenges_phone', ['phone'])
export class LoginSmsChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Telefone normalizado (ex.: 5561999988888) */
  @Column({ length: 20 })
  phone: string;

  @Column({ name: 'code_hash', length: 255 })
  codeHash: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
