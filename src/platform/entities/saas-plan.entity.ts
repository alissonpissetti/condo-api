import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { SaasPlanFeatures } from '../saas-plan-features';
import type { SaasPlanPriceTier } from '../saas-plan-unit-pricing';

@Entity('saas_plans')
export class SaasPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  /** Valor em centavos cobrado por unidade condominal ao mês (plataforma). */
  @Column({ name: 'price_per_unit_cents', type: 'int', default: 0 })
  pricePerUnitCents: number;

  /**
   * Faixas opcionais: preço por unidade conforme o total de unidades do condomínio.
   * Se null, usa só `pricePerUnitCents`.
   */
  /** JSON: `json` em MySQL/Postgres (evitar `jsonb` — não existe no MySQL). */
  @Column({ name: 'unit_price_tiers', type: 'json', nullable: true })
  unitPriceTiers: SaasPlanPriceTier[] | null;

  @Column({ type: 'varchar', length: 3, default: 'BRL' })
  currency: string;

  /**
   * Plano atribuído a novos registos e usado como fallback quando o titular
   * não tem plano definido. Apenas um plano deve ter `true`.
   */
  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ default: true })
  active: boolean;

  /**
   * Texto público para o site (lista de linhas ou parágrafo curto).
   * Uma linha por bullet; prefixos `-`, `*` ou `•` são removidos na UI.
   */
  @Column({ name: 'catalog_blurb', type: 'text', nullable: true })
  catalogBlurb: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /**
   * Flags de módulos habilitados no painel para este plano. `null` = plano
   * legado sem restrições (todos os módulos liberados).
   */
  @Column({ type: 'json', nullable: true })
  features: SaasPlanFeatures | null;

  @OneToMany('User', 'plan')
  users: unknown[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
