import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Grouping } from '../groupings/grouping.entity';
import type { SaasPlanFeatures } from '../platform/saas-plan-features';
import { SaasPlansService } from '../platform/saas-plans.service';
import { CondominiumParticipant } from '../planning/entities/condominium-participant.entity';
import { GovernanceRole } from '../planning/enums/governance-role.enum';
import { Condominium } from './condominium.entity';
import { CreateCondominiumDto } from './dto/create-condominium.dto';
import { UpdateCondominiumDto } from './dto/update-condominium.dto';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';

export type CondominiumListItem = {
  id: string;
  name: string;
  ownerId: string;
  /** Plano gravado no condomínio; `null` = até à alteração, usa regras de fallback (titular / padrão). */
  saasPlanId: number | null;
  /** Plano efetivo para faturamento (após resolver titular / padrão). */
  billingPlanId: number;
  billingPlanName: string;
  billingPricePerUnitCents: number;
  /** Módulos habilitados pelo plano efetivo (chaves conforme `saas-plan-features.ts`). */
  billingPlanFeatures: SaasPlanFeatures;
  createdAt: Date;
  updatedAt: Date;
  hasSyndic: boolean;
  /** Nome da pessoa (perfil); nunca e-mail. */
  syndicName: string | null;
  /** Só no detalhe GET :id (titular / acesso). */
  billingPixKey?: string | null;
  billingPixBeneficiaryName?: string | null;
  billingPixCity?: string | null;
  syndicWhatsappForReceipts?: string | null;
  /** Só no detalhe GET :id — incluir QR Code PIX no PDF de transparência. */
  transparencyPdfIncludePixQrCode?: boolean;
  /** Só no detalhe GET :id — existe logo se não for null. */
  managementLogoStorageKey?: string | null;
  /** Só no detalhe GET :id — modelo de cobrança em uso (padrão: manual_pix). */
  billingChargeModel?: string;
  /** Só no detalhe GET :id — dia do mês (1..31) para vencimento padrão. */
  billingDefaultDueDay?: number;
  /** Só no detalhe GET :id — juros em basis points (1 bp = 0,01 %). */
  billingLateInterestBps?: number;
};

@Injectable()
export class CondominiumsService {
  constructor(
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    @InjectRepository(CondominiumParticipant)
    private readonly participantRepo: Repository<CondominiumParticipant>,
    private readonly dataSource: DataSource,
    private readonly saasPlans: SaasPlansService,
    @Inject(RECEIPT_STORAGE) private readonly storage: ReceiptStoragePort,
  ) {}

  async assertOwner(
    condominiumId: string,
    userId: string,
  ): Promise<Condominium> {
    const condo = await this.condoRepo.findOne({
      where: { id: condominiumId, ownerId: userId },
    });
    if (!condo) {
      throw new ForbiddenException('Condominium not found or access denied');
    }
    return condo;
  }

  findAllForOwner(userId: string): Promise<CondominiumListItem[]> {
    return this.findAllAccessible(userId);
  }

  /** Titular da conta ou participante de gestão (síndico/admin/owner na tabela). */
  async findAllAccessible(userId: string): Promise<CondominiumListItem[]> {
    const byOwnerOrParticipant = await this.condoRepo
      .createQueryBuilder('c')
      .leftJoin(
        'condominium_participants',
        'p',
        'p.condominium_id = c.id AND p.user_id = :uid',
        { uid: userId },
      )
      .where('c.owner_id = :uid OR p.user_id IS NOT NULL', { uid: userId })
      .getMany();

    const byUnit = await this.condoRepo
      .createQueryBuilder('c')
      .distinct(true)
      .innerJoin('groupings', 'g', 'g.condominium_id = c.id')
      .innerJoin('units', 'u', 'u.grouping_id = g.id')
      .leftJoin('people', 'op', 'op.id = u.owner_person_id')
      .leftJoin(
        'unit_responsible_people',
        'urp',
        'urp.unit_id = u.id',
      )
      .leftJoin('people', 'rp', 'rp.id = urp.person_id')
      .where('op.user_id = :uid OR rp.user_id = :uid', { uid: userId })
      .getMany();

    const map = new Map<string, Condominium>();
    for (const x of [...byOwnerOrParticipant, ...byUnit]) {
      map.set(x.id, x);
    }
    const sorted = Array.from(map.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return this.withSyndicNames(sorted);
  }

  private async withSyndicNames(
    condos: Condominium[],
  ): Promise<CondominiumListItem[]> {
    if (condos.length === 0) {
      return [];
    }
    const ids = condos.map((c) => c.id);
    const syndics = await this.participantRepo.find({
      where: { condominiumId: In(ids), role: GovernanceRole.Syndic },
      relations: ['person'],
    });
    const syndicByCondo = new Map<
      string,
      { hasSyndic: true; name: string | null }
    >();
    for (const s of syndics) {
      if (syndicByCondo.has(s.condominiumId)) {
        continue;
      }
      const personName = s.person?.fullName?.trim();
      const name =
        personName && personName.length > 0 ? personName : null;
      syndicByCondo.set(s.condominiumId, { hasSyndic: true, name });
    }

    const withPlans = await Promise.all(
      condos.map(async (c) => {
        const plan = await this.saasPlans.resolvePlanForCondominium(c);
        return { c, plan };
      }),
    );

    const unitByCondo = await this.saasPlans.countUnitsByCondominiumIds(ids);

    return withPlans.map(({ c, plan }): CondominiumListItem => ({
      id: c.id,
      name: c.name,
      ownerId: c.ownerId,
      saasPlanId: c.saasPlanId ?? null,
      billingPlanId: plan.id,
      billingPlanName: plan.name,
      billingPricePerUnitCents: this.saasPlans.effectivePricePerUnitCents(
        plan,
        unitByCondo.get(c.id) ?? 0,
      ),
      billingPlanFeatures: this.saasPlans.resolvePlanFeatures(plan),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      hasSyndic: syndicByCondo.has(c.id),
      syndicName: syndicByCondo.get(c.id)?.name ?? null,
    }));
  }

  async findOneAccessible(
    id: string,
    userId: string,
  ): Promise<CondominiumListItem> {
    const all = await this.findAllAccessible(userId);
    const c = all.find((x) => x.id === id);
    if (!c) {
      throw new NotFoundException('Condominium not found');
    }
    const full = await this.condoRepo.findOne({
      where: { id },
      select: {
        id: true,
        billingPixKey: true,
        billingPixBeneficiaryName: true,
        billingPixCity: true,
        syndicWhatsappForReceipts: true,
        transparencyPdfIncludePixQrCode: true,
        managementLogoStorageKey: true,
        billingChargeModel: true,
        billingDefaultDueDay: true,
        billingLateInterestBps: true,
      },
    });
    return {
      ...c,
      billingPixKey: full?.billingPixKey ?? null,
      billingPixBeneficiaryName: full?.billingPixBeneficiaryName ?? null,
      billingPixCity: full?.billingPixCity ?? null,
      syndicWhatsappForReceipts: full?.syndicWhatsappForReceipts ?? null,
      transparencyPdfIncludePixQrCode:
        full?.transparencyPdfIncludePixQrCode ?? true,
      managementLogoStorageKey: full?.managementLogoStorageKey ?? null,
      billingChargeModel: full?.billingChargeModel ?? 'manual_pix',
      billingDefaultDueDay: full?.billingDefaultDueDay ?? 10,
      billingLateInterestBps: full?.billingLateInterestBps ?? 0,
    };
  }

  async findById(condominiumId: string): Promise<Condominium | null> {
    return this.condoRepo.findOne({ where: { id: condominiumId } });
  }

  /** Para jobs internos (ex.: fechamento mensal automático). */
  async findAllCondominiumIds(): Promise<string[]> {
    const rows = await this.condoRepo.find({ select: ['id'] });
    return rows.map((r) => r.id);
  }

  async findOneForOwner(id: string, userId: string): Promise<Condominium> {
    const condo = await this.condoRepo.findOne({
      where: { id, ownerId: userId },
    });
    if (!condo) {
      throw new NotFoundException('Condominium not found');
    }
    return condo;
  }

  /**
   * Carrega o condomínio para mutação por papéis de gestão (titular, síndico,
   * subsíndico ou administrador). Lança 404 se o id não existir e 403 se o
   * usuário não tiver permissão de gestão neste condomínio.
   */
  async findOneForManagement(
    id: string,
    userId: string,
  ): Promise<Condominium> {
    const condo = await this.condoRepo.findOne({ where: { id } });
    if (!condo) {
      throw new NotFoundException('Condominium not found');
    }
    if (condo.ownerId === userId) {
      return condo;
    }
    const allowed = await this.participantRepo
      .createQueryBuilder('p')
      .where('p.condominium_id = :cid', { cid: id })
      .andWhere('p.user_id = :uid', { uid: userId })
      .andWhere('p.role IN (:...roles)', {
        roles: [
          GovernanceRole.Syndic,
          GovernanceRole.SubSyndic,
          GovernanceRole.Admin,
          GovernanceRole.Owner,
        ],
      })
      .getCount();
    if (allowed === 0) {
      throw new ForbiddenException(
        'Permissão de gestão necessária (titular, síndico, subsíndico ou administrador).',
      );
    }
    return condo;
  }

  async create(
    userId: string,
    dto: CreateCondominiumDto,
  ): Promise<Condominium> {
    return this.dataSource.transaction(async (manager) => {
      let saasPlanId: number;
      if (dto.planId != null) {
        const p = await this.saasPlans.getPlan(dto.planId);
        if (!p.active) {
          throw new BadRequestException('Este plano não está disponível.');
        }
        saasPlanId = p.id;
      } else {
        saasPlanId = await this.saasPlans.resolveDefaultPlanIdForNewUser();
      }

      const condo = manager.create(Condominium, {
        ownerId: userId,
        name: dto.name,
        saasPlanId,
      });
      await manager.save(condo);
      const grouping = manager.create(Grouping, {
        condominiumId: condo.id,
        name: 'Geral',
      });
      await manager.save(grouping);
      return condo;
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCondominiumDto,
  ): Promise<Condominium> {
    const condo = await this.findOneForManagement(id, userId);
    if (dto.planId !== undefined) {
      // Trocar o plano SaaS continua a ser exclusivo do titular da conta
      // (impacto financeiro directo); demais campos abrem para a gestão.
      if (condo.ownerId !== userId) {
        throw new ForbiddenException(
          'Apenas o titular da conta pode alterar o plano SaaS deste condomínio.',
        );
      }
    }
    if (dto.name !== undefined) {
      condo.name = dto.name;
    }
    if (dto.planId !== undefined) {
      const p = await this.saasPlans.getPlan(dto.planId);
      if (!p.active) {
        throw new BadRequestException('Este plano não está disponível.');
      }
      condo.saasPlanId = p.id;
    }
    if (dto.billingPixKey !== undefined) {
      condo.billingPixKey = dto.billingPixKey?.trim() || null;
    }
    if (dto.billingPixBeneficiaryName !== undefined) {
      condo.billingPixBeneficiaryName =
        dto.billingPixBeneficiaryName?.trim() || null;
    }
    if (dto.billingPixCity !== undefined) {
      condo.billingPixCity = dto.billingPixCity?.trim() || null;
    }
    if (dto.syndicWhatsappForReceipts !== undefined) {
      condo.syndicWhatsappForReceipts =
        dto.syndicWhatsappForReceipts?.trim() || null;
    }
    if (dto.transparencyPdfIncludePixQrCode !== undefined) {
      condo.transparencyPdfIncludePixQrCode = dto.transparencyPdfIncludePixQrCode;
    }
    if (dto.billingChargeModel !== undefined) {
      condo.billingChargeModel = dto.billingChargeModel;
    }
    if (dto.billingDefaultDueDay !== undefined) {
      condo.billingDefaultDueDay = dto.billingDefaultDueDay;
    }
    if (dto.billingLateInterestBps !== undefined) {
      condo.billingLateInterestBps = dto.billingLateInterestBps;
    }
    return this.condoRepo.save(condo);
  }

  /**
   * Texto para WhatsApp de comprovantes: campo do condomínio ou telefone da ficha do síndico.
   */
  async resolveSyndicWhatsappDisplay(condominiumId: string): Promise<string | null> {
    const condo = await this.condoRepo.findOne({ where: { id: condominiumId } });
    if (!condo) {
      return null;
    }
    const override = condo.syndicWhatsappForReceipts?.trim();
    if (override) {
      return override;
    }
    const syndics = await this.participantRepo.find({
      where: { condominiumId, role: GovernanceRole.Syndic },
      relations: { person: true },
      order: { createdAt: 'ASC' },
      take: 1,
    });
    const raw = syndics[0]?.person?.phone?.trim();
    if (!raw) {
      return null;
    }
    return this.formatBrazilPhoneHint(raw);
  }

  private formatBrazilPhoneHint(phone: string): string {
    const d = phone.replace(/\D/g, '');
    if (d.length === 11) {
      return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
    }
    if (d.length === 10) {
      return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
    }
    return phone.trim();
  }

  /**
   * Apenas o titular da conta que criou o condomínio (`owner_id`) pode eliminá-lo.
   */
  async remove(id: string, userId: string): Promise<void> {
    await this.assertOwner(id, userId);
    await this.condoRepo.delete(id);
  }

  async uploadManagementLogo(
    condominiumId: string,
    userId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ managementLogoStorageKey: string }> {
    const condo = await this.findOneForManagement(condominiumId, userId);
    if (condo.managementLogoStorageKey) {
      await this.storage.deleteManagementLogo(
        condominiumId,
        condo.managementLogoStorageKey,
      );
    }
    const key = await this.storage.saveManagementLogo(
      condominiumId,
      buffer,
      mimeType,
    );
    condo.managementLogoStorageKey = key;
    await this.condoRepo.save(condo);
    return { managementLogoStorageKey: key };
  }

  async deleteManagementLogo(
    condominiumId: string,
    userId: string,
  ): Promise<void> {
    const condo = await this.findOneForManagement(condominiumId, userId);
    if (!condo.managementLogoStorageKey) {
      return;
    }
    await this.storage.deleteManagementLogo(
      condominiumId,
      condo.managementLogoStorageKey,
    );
    condo.managementLogoStorageKey = null;
    await this.condoRepo.save(condo);
  }

  async readManagementLogoForOwner(
    condominiumId: string,
    userId: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const item = await this.findOneAccessible(condominiumId, userId);
    if (!item.managementLogoStorageKey) {
      throw new NotFoundException('Logo não configurada.');
    }
    return this.storage.readManagementLogo(
      condominiumId,
      item.managementLogoStorageKey,
    );
  }
}
