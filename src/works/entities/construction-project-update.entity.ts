import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { ConstructionProject } from './construction-project.entity';

@Entity('construction_project_updates')
export class ConstructionProjectUpdate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => ConstructionProject, (p) => p.updates, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project: ConstructionProject;

  @Column({ name: 'occurred_on', type: 'date' })
  occurredOn: Date;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'created_by_user_id', type: 'varchar', length: 36, nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: User | null;

  @Column({
    name: 'attachment_storage_keys',
    type: 'json',
    nullable: true,
  })
  attachmentStorageKeys: string[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
