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
import type { SupplierPixKeyType } from '../supplier-pix-key-type';
import { SupplierCategory } from './supplier-category.entity';

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'condominium_id' })
  condominiumId: string;

  @ManyToOne(() => Condominium, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'condominium_id' })
  condominium: Condominium;

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => SupplierCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: SupplierCategory;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'legal_name', type: 'varchar', length: 255, nullable: true })
  legalName: string | null;

  @Column({
    name: 'document_cnpj_cpf',
    type: 'varchar',
    length: 18,
    nullable: true,
  })
  documentCnpjCpf: string | null;

  @Column({ name: 'pix_key_type', type: 'varchar', length: 16, nullable: true })
  pixKeyType: SupplierPixKeyType | null;

  @Column({ name: 'pix_key_value', type: 'varchar', length: 255, nullable: true })
  pixKeyValue: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'address_line', type: 'varchar', length: 500, nullable: true })
  addressLine: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
