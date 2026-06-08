import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Condominium } from '../../condominiums/condominium.entity';
import { CondominiumSupplierCategory } from './condominium-supplier-category.entity';

@Entity('condominium_suppliers')
export class CondominiumSupplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 255, nullable: true })
  contactName: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ name: 'pix_key', type: 'varchar', length: 255, nullable: true })
  pixKey: string | null;

  @Column({ name: 'category_id', type: 'varchar', length: 36, nullable: true })
  categoryId: string | null;

  @ManyToOne(() => CondominiumSupplierCategory, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: CondominiumSupplierCategory | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
