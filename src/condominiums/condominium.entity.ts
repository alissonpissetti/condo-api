import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Grouping } from '../groupings/grouping.entity';
import { SaasPlan } from '../platform/entities/saas-plan.entity';
import { SaasVoucher } from '../platform/entities/saas-voucher.entity';

@Entity('condominiums')
export class Condominium {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column()
  name: string;

  /** Plano SaaS efetivo para faturamento deste condomínio (sobrepor ao plano do titular). */
  @Column({ name: 'saas_plan_id', type: 'int', nullable: true })
  saasPlanId: number | null;

  @ManyToOne(() => SaasPlan, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'saas_plan_id' })
  saasPlan: SaasPlan | null;

  @Column({ name: 'saas_voucher_id', type: 'varchar', length: 36, nullable: true })
  saasVoucherId: string | null;

  @ManyToOne(() => SaasVoucher, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'saas_voucher_id' })
  saasVoucher: SaasVoucher | null;

  @OneToMany(() => Grouping, (g) => g.condominium)
  groupings: Grouping[];

  /** Chave PIX do condomínio (receitas / taxa); usada no PDF de transparência. */
  @Column({ name: 'billing_pix_key', type: 'varchar', length: 255, nullable: true })
  billingPixKey: string | null;

  /** Nome do beneficiário (máx. 25 caracteres, regra PIX). */
  @Column({
    name: 'billing_pix_beneficiary_name',
    type: 'varchar',
    length: 25,
    nullable: true,
  })
  billingPixBeneficiaryName: string | null;

  /** Cidade do beneficiário (máx. 15 caracteres, regra PIX). */
  @Column({
    name: 'billing_pix_city',
    type: 'varchar',
    length: 15,
    nullable: true,
  })
  billingPixCity: string | null;

  /**
   * Se false, o PDF de transparência mostra apenas a chave PIX em texto
   * (sem imagem de QR Code nem código BR «Copia e cola»).
   */
  @Column({
    name: 'transparency_pdf_include_pix_qrcode',
    type: 'boolean',
    default: true,
  })
  transparencyPdfIncludePixQrCode: boolean;

  /**
   * Modelo de cobrança em uso. Atualmente o único valor é `manual_pix`
   * (o morador paga manualmente via PIX e envia comprovante ao síndico);
   * campo preparado para receber modelos futuros (ex.: boleto, cartão).
   */
  @Column({
    name: 'billing_charge_model',
    type: 'varchar',
    length: 32,
    default: 'manual_pix',
  })
  billingChargeModel: string;

  /** Dia do mês (1..31) sugerido como vencimento da taxa condominial. */
  @Column({
    name: 'billing_default_due_day',
    type: 'int',
    default: 10,
  })
  billingDefaultDueDay: number;

  /**
   * Taxa de juros aplicada em atraso, em basis points (1 bp = 0,01 %).
   * Ex.: 250 representa 2,50 % ao mês. Guardado como inteiro para evitar float.
   */
  @Column({
    name: 'billing_late_interest_bps',
    type: 'int',
    default: 0,
  })
  billingLateInterestBps: number;

  /** WhatsApp para envio de comprovantes (texto livre, ex.: 41 99989-7602). Se vazio, usa telefone da ficha do síndico. */
  @Column({
    name: 'syndic_whatsapp_for_receipts',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  syndicWhatsappForReceipts: string | null;

  /** Logo da gestão (imagem) para PDFs de transparência; chave no armazenamento do condomínio. */
  @Column({
    name: 'management_logo_storage_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  managementLogoStorageKey: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
