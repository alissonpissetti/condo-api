import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('people')
export class Person {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** CPF apenas dígitos (11) ou null. */
  @Column({ type: 'varchar', length: 11, nullable: true, unique: true })
  cpf: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email: string | null;

  @Column({ name: 'full_name' })
  fullName: string;

  /** CEP (8 dígitos), logradouro e resto do endereço — obrigatório no cadastro/associação. */
  @Column({ name: 'address_zip', type: 'varchar', length: 8, nullable: true })
  addressZip: string | null;

  @Column({
    name: 'address_street',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  addressStreet: string | null;

  @Column({
    name: 'address_number',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  addressNumber: string | null;

  @Column({
    name: 'address_complement',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  addressComplement: string | null;

  @Column({
    name: 'address_neighborhood',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  addressNeighborhood: string | null;

  @Column({
    name: 'address_city',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  addressCity: string | null;

  @Column({ name: 'address_state', type: 'varchar', length: 2, nullable: true })
  addressState: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
