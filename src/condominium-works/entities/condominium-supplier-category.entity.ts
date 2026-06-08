import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('condominium_supplier_categories')
export class CondominiumSupplierCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * `0` = categoria padrão (todos os condomínios); caso contrário, UUID do condomínio dono.
   */
  @Column({ name: 'condominium_id', type: 'varchar', length: 36 })
  condominiumId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
