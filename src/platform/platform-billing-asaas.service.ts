import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import { MailService } from '../mail/mail.service';
import { Person } from '../people/person.entity';
import type { CreateSaasChargeDto } from './dto/create-saas-charge.dto';
import { AsaasClientService } from './asaas-client.service';
import type { SaasChargeStatus } from './entities/saas-charge.entity';
import { SaasCharge } from './entities/saas-charge.entity';
import { SaasCondominiumBilling } from './entities/saas-condominium-billing.entity';
import { PlatformService } from './platform.service';
import {
  addCalendarDays,
  calendarYmdInTz,
  compareYmd,
  DEFAULT_SAAS_BILLING_TZ,
  dueDayOfMonthFromDate,
  firstSubscriptionDueYmd,
  nextSubscriptionDueAfter,
  todayYmdInTz,
} from './saas-billing-cycle.util';
import { SaasPlansService } from './saas-plans.service';

@Injectable()
export class PlatformBillingAsaasService {
  private readonly logger = new Logger(PlatformBillingAsaasService.name);

  constructor(
    private readonly platform: PlatformService,
    private readonly saasPlans: SaasPlansService,
    private readonly asaas: AsaasClientService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @InjectRepository(Condominium)
    private readonly condoRepo: Repository<Condominium>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(SaasCharge)
    private readonly chargeRepo: Repository<SaasCharge>,
    @InjectRepository(SaasCondominiumBilling)
    private readonly billingRepo: Repository<SaasCondominiumBilling>,
  ) {}

  async dashboardSummary(): Promise<{
    condominiumTotal: number;
    pendingChargesThisMonth: number;
    referenceMonth: string;
  }> {
    const condominiumTotal = await this.condoRepo.count();
    const referenceMonth = this.currentReferenceMonth();
    const pendingChargesThisMonth = await this.chargeRepo.count({
      where: {
        referenceMonth,
        status: In(['pending', 'overdue']),
      },
    });
    return {
      condominiumTotal,
      pendingChargesThisMonth,
      referenceMonth,
    };
  }

  async createMonthlyCharge(
    condominiumId: string,
    dto: CreateSaasChargeDto,
  ): Promise<{
    reused: boolean;
    charge: Record<string, unknown>;
  }> {
    const condo = await this.condoRepo.findOne({
      where: { id: condominiumId },
      relations: { owner: true },
    });
    if (!condo) {
      throw new NotFoundException('Condomínio não encontrado.');
    }

    const pricing = await this.saasPlans.computeCondominiumPlanPricing(
      condominiumId,
      dto.referenceMonth,
    );
    if (pricing.unitCount === 0) {
      throw new BadRequestException(
        'Este condomínio não tem unidades cadastradas; não é possível calcular a mensalidade (plano × unidades).',
      );
    }
    if (pricing.baseMonthlyCents <= 0) {
      throw new BadRequestException(
        'O valor base mensal é zero: ajuste o preço por unidade do plano ou verifique o plano do titular.',
      );
    }

    const tz = this.config.get<string>('SAAS_BILLING_TZ', DEFAULT_SAAS_BILLING_TZ);
    let billing = await this.platform.getBillingRow(condominiumId);
    if (!billing) {
      billing = this.billingRepo.create({
        condominiumId,
        monthlyAmountCents: pricing.monthlyCents,
        currency: pricing.currency,
        status: 'active',
        billingDueDay: dueDayOfMonthFromDate(condo.createdAt, tz),
        notes: null,
        asaasCustomerId: null,
      });
    } else {
      if (billing.status === 'suspended') {
        throw new BadRequestException(
          'Faturamento suspenso para este condomínio.',
        );
      }
      billing.monthlyAmountCents = pricing.monthlyCents;
      billing.currency = pricing.currency;
    }
    await this.billingRepo.save(billing);

    const referenceMonth = dto.referenceMonth;
    const existing = await this.chargeRepo.findOne({
      where: { condominiumId, referenceMonth },
    });
    if (existing && existing.status !== 'cancelled') {
      return { reused: true, charge: this.serializeCharge(existing) };
    }
    if (existing?.status === 'cancelled') {
      await this.chargeRepo.remove(existing);
    }

    const dueDate = dto.dueDate?.slice(0, 10) ?? this.defaultDueDateIso();

    if (pricing.monthlyCents <= 0) {
      const charge = this.chargeRepo.create({
        id: randomUUID(),
        condominiumId,
        referenceMonth,
        amountCents: 0,
        dueDate,
        status: 'confirmed',
        asaasPaymentId: null,
        invoiceUrl: null,
        bankSlipUrl: null,
        pixQrPayload: null,
        paidAt: new Date(),
        rawLastWebhookAt: null,
      });
      await this.chargeRepo.save(charge);
      return { reused: false, charge: this.serializeCharge(charge) };
    }

    this.asaas.assertConfigured();

    const person = await this.personRepo.findOne({
      where: { userId: condo.ownerId },
    });
    const cpf = person?.cpf?.replace(/\D/g, '') ?? '';
    if (!cpf || cpf.length < 11) {
      throw new BadRequestException(
        'O titular precisa de CPF válido no perfil (pessoa) para emitir cobrança Asaas.',
      );
    }

    const customerId = await this.ensureAsaasCustomer(
      condo,
      billing,
      person,
      cpf,
    );

    const charge = this.chargeRepo.create({
      id: randomUUID(),
      condominiumId,
      referenceMonth,
      amountCents: pricing.monthlyCents,
      dueDate,
      status: 'pending',
      asaasPaymentId: null,
      invoiceUrl: null,
      bankSlipUrl: null,
      pixQrPayload: null,
      paidAt: null,
      rawLastWebhookAt: null,
    });
    await this.chargeRepo.save(charge);

    const value = Math.round(pricing.monthlyCents) / 100;
    const description = `Mensalidade plataforma — ${condo.name} (${referenceMonth})`;

    try {
      const payPayload = await this.asaas.createPayment({
        customer: customerId,
        billingType: 'UNDEFINED',
        value,
        dueDate,
        externalReference: charge.id,
        description,
      });
      this.applyPaymentResponseToCharge(charge, payPayload);
      await this.chargeRepo.save(charge);
    } catch (err) {
      await this.chargeRepo.remove(charge);
      throw err;
    }

    return { reused: false, charge: this.serializeCharge(charge) };
  }

  private async ensureAsaasCustomer(
    condo: Condominium,
    billing: SaasCondominiumBilling,
    person: Person | null,
    cpfDigits: string,
  ): Promise<string> {
    if (billing.asaasCustomerId) {
      return billing.asaasCustomerId;
    }
    const email = condo.owner.email.trim().toLowerCase();
    const found = await this.asaas.findCustomersByEmail(email);
    let customerId: string;
    if (found.totalCount > 0 && found.data[0]?.id) {
      customerId = found.data[0].id;
    } else {
      const name =
        person?.fullName?.trim() ||
        condo.name.trim() ||
        `Condômino ${email}`;
      const created = await this.asaas.createCustomer({
        name,
        email,
        cpfCnpj: cpfDigits,
      });
      customerId = created.id;
    }
    billing.asaasCustomerId = customerId;
    await this.billingRepo.save(billing);
    return customerId;
  }

  private applyPaymentResponseToCharge(
    charge: SaasCharge,
    payPayload: Record<string, unknown>,
  ): void {
    const id = this.asaas.extractPaymentId(payPayload);
    if (id) {
      charge.asaasPaymentId = id;
    }
    const invoiceUrl = payPayload.invoiceUrl;
    if (typeof invoiceUrl === 'string' && invoiceUrl) {
      charge.invoiceUrl = invoiceUrl;
    }
    const bankSlip = payPayload.bankSlip as
      | { bankSlipUrl?: string }
      | undefined;
    if (bankSlip?.bankSlipUrl && typeof bankSlip.bankSlipUrl === 'string') {
      charge.bankSlipUrl = bankSlip.bankSlipUrl;
    }
    const pix = payPayload.pix as { payload?: string } | undefined;
    if (pix?.payload && typeof pix.payload === 'string') {
      charge.pixQrPayload = pix.payload;
    }
    const st = String(payPayload.status ?? '').toUpperCase();
    charge.status = this.mapAsaasPaymentStatusToCharge(st);
    if (st === 'CONFIRMED' || st === 'RECEIVED' || st === 'RECEIVED_IN_CASH') {
      charge.paidAt = new Date();
    }
  }

  private mapAsaasPaymentStatusToCharge(status: string): SaasChargeStatus {
    switch (status) {
      case 'CONFIRMED':
      case 'RECEIVED':
      case 'RECEIVED_IN_CASH':
        return 'confirmed';
      case 'OVERDUE':
        return 'overdue';
      case 'DELETED':
      case 'REFUNDED':
        return 'cancelled';
      default:
        return 'pending';
    }
  }

  async handleAsaasWebhook(body: Record<string, unknown>): Promise<{
    ok: boolean;
    skipped?: boolean;
  }> {
    const payment =
      (body.payment as Record<string, unknown> | undefined) ??
      (body.object === 'payment'
        ? (body as Record<string, unknown>)
        : undefined);
    if (!payment || typeof payment !== 'object') {
      return { ok: true, skipped: true };
    }

    const ext = payment.externalReference;
    const paymentId = this.asaas.extractPaymentId(payment);

    let charge: SaasCharge | null = null;
    if (ext != null && String(ext).trim() !== '') {
      charge = await this.platform.getChargeById(String(ext));
    }
    if (!charge && paymentId) {
      charge = await this.chargeRepo.findOne({
        where: { asaasPaymentId: paymentId },
      });
    }
    if (!charge) {
      return { ok: true, skipped: true };
    }

    const event = String(body.event ?? '').toUpperCase();
    if (
      event.includes('DELETED') ||
      event.includes('REFUND') ||
      String(payment.status ?? '').toUpperCase() === 'REFUNDED'
    ) {
      charge.status = 'cancelled';
      charge.rawLastWebhookAt = new Date();
      await this.chargeRepo.save(charge);
      return { ok: true };
    }

    this.applyPaymentResponseToCharge(charge, payment);
    charge.rawLastWebhookAt = new Date();
    const st = String(payment.status ?? '').toUpperCase();
    if (event.includes('OVERDUE') || st === 'OVERDUE') {
      charge.status = 'overdue';
    }
    await this.chargeRepo.save(charge);
    return { ok: true };
  }

  /**
   * Fallback quando webhooks falham: consulta GET /v3/payments/:id na Asaas para cada
   * cobrança local ainda pendente ou em atraso com asaasPaymentId.
   */
  async syncPendingChargesFromAsaas(): Promise<{
    checked: number;
    updated: number;
    unchanged: number;
    errors: Array<{ chargeId: string; message: string }>;
  }> {
    this.asaas.assertConfigured();
    const withPayment = await this.chargeRepo.find({
      where: {
        status: In(['pending', 'overdue']),
        asaasPaymentId: Not(IsNull()),
      },
      order: { createdAt: 'ASC' },
      take: 500,
    });
    let updated = 0;
    let unchanged = 0;
    const errors: Array<{ chargeId: string; message: string }> = [];
    for (const charge of withPayment) {
      const pid = charge.asaasPaymentId?.trim();
      if (!pid) {
        continue;
      }
      try {
        const payPayload = await this.asaas.getPayment(pid);
        const beforeStatus = charge.status;
        const beforePaid = charge.paidAt?.getTime() ?? null;
        this.applyPaymentResponseToCharge(charge, payPayload);
        const st = String(payPayload.status ?? '').toUpperCase();
        if (st === 'OVERDUE') {
          charge.status = 'overdue';
        }
        charge.rawLastWebhookAt = new Date();
        const afterPaid = charge.paidAt?.getTime() ?? null;
        if (charge.status !== beforeStatus || beforePaid !== afterPaid) {
          updated += 1;
        } else {
          unchanged += 1;
        }
        await this.chargeRepo.save(charge);
      } catch (e) {
        const err = e as { message?: string; getResponse?: () => unknown };
        let msg = err?.message ?? String(e);
        if (typeof err?.getResponse === 'function') {
          const body = err.getResponse();
          if (typeof body === 'object' && body && 'message' in body) {
            const m = (body as { message: unknown }).message;
            msg = Array.isArray(m) ? m.join(' ') : String(m);
          }
        }
        errors.push({ chargeId: charge.id, message: msg });
      }
    }
    return {
      checked: updated + unchanged + errors.length,
      updated,
      unchanged,
      errors,
    };
  }

  /**
   * Ciclo diário: suspende faturamento 5 dias após vencimento sem pagamento;
   * gera cobrança ~N dias antes do vencimento e notifica o titular por e-mail.
   */
  async runDailySubscriptionBillingCycle(): Promise<{
    today: string;
    suspendedCondominiums: number;
    chargesCreated: number;
    skipped: number;
    errors: number;
  }> {
    const tz = this.config.get<string>('SAAS_BILLING_TZ', DEFAULT_SAAS_BILLING_TZ);
    const today = todayYmdInTz(tz);
    const daysBefore = parseInt(
      this.config.get<string>('SAAS_BILLING_GENERATE_DAYS_BEFORE', '10'),
      10,
    );
    const suspendAfter = parseInt(
      this.config.get<string>('SAAS_BILLING_SUSPEND_DAYS_AFTER_DUE', '5'),
      10,
    );
    const genBefore = Number.isFinite(daysBefore) && daysBefore > 0 ? daysBefore : 10;
    const suspendDays =
      Number.isFinite(suspendAfter) && suspendAfter > 0 ? suspendAfter : 5;

    const suspended = await this.suspendDelinquentBillings(today, suspendDays, tz);
    let chargesCreated = 0;
    let skipped = 0;
    let errors = 0;

    const condos = await this.condoRepo.find({ relations: { owner: true } });

    for (const condo of condos) {
      if (!condo.owner?.email) {
        skipped += 1;
        continue;
      }

      const billing = await this.billingRepo.findOne({
        where: { condominiumId: condo.id },
      });
      if (billing?.status === 'suspended') {
        skipped += 1;
        continue;
      }

      const dueDay = billing
        ? Math.min(31, Math.max(1, billing.billingDueDay ?? 1))
        : dueDayOfMonthFromDate(condo.createdAt, tz);
      const condoCreatedYmd = calendarYmdInTz(condo.createdAt, tz);
      const lastDue = await this.getLatestNonCancelledChargeDueYmd(condo.id);
      const nextDue = lastDue
        ? nextSubscriptionDueAfter(lastDue, dueDay)
        : firstSubscriptionDueYmd(condoCreatedYmd, dueDay);

      const generateFromYmd = addCalendarDays(nextDue, -genBefore);
      if (compareYmd(today, generateFromYmd) < 0) {
        skipped += 1;
        continue;
      }

      const referenceMonth = nextDue.slice(0, 7);
      const existing = await this.chargeRepo.findOne({
        where: { condominiumId: condo.id, referenceMonth },
      });
      if (existing && existing.status !== 'cancelled') {
        skipped += 1;
        continue;
      }

      try {
        const r = await this.createMonthlyCharge(condo.id, {
          referenceMonth,
          dueDate: nextDue,
        });
        if (!r.reused) {
          chargesCreated += 1;
          const ch = r.charge;
          const billingRow =
            billing ??
            (await this.billingRepo.findOne({
              where: { condominiumId: condo.id },
            }));
          await this.mail.sendSaasSubscriptionCharge({
            to: condo.owner.email.trim().toLowerCase(),
            condominiumName: condo.name,
            referenceMonth: String(ch.referenceMonth),
            dueDate: String(ch.dueDate).slice(0, 10),
            amountCents: Number(ch.amountCents),
            currency: billingRow?.currency ?? 'BRL',
            invoiceUrl:
              typeof ch.invoiceUrl === 'string' ? ch.invoiceUrl : null,
            bankSlipUrl:
              typeof ch.bankSlipUrl === 'string' ? ch.bankSlipUrl : null,
            pixQrPayload:
              typeof ch.pixQrPayload === 'string' ? ch.pixQrPayload : null,
          });
        } else {
          skipped += 1;
        }
      } catch (e) {
        errors += 1;
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Ciclo SaaS condomínio ${condo.id}: ${msg}`);
      }
    }

    return {
      today,
      suspendedCondominiums: suspended,
      chargesCreated,
      skipped,
      errors,
    };
  }

  private async suspendDelinquentBillings(
    todayYmd: string,
    suspendDaysAfterDue: number,
    _tz: string,
  ): Promise<number> {
    const cutoff = addCalendarDays(todayYmd, -suspendDaysAfterDue);
    const delinquent = await this.chargeRepo.find({
      where: {
        status: In(['pending', 'overdue']),
        dueDate: LessThanOrEqual(cutoff),
      },
      select: { condominiumId: true },
    });
    const uniqueIds = [...new Set(delinquent.map((c) => c.condominiumId))];

    let n = 0;
    for (const id of uniqueIds) {
      const billing = await this.billingRepo.findOne({
        where: { condominiumId: id },
      });
      if (!billing || billing.status !== 'active') {
        continue;
      }
      billing.status = 'suspended';
      await this.billingRepo.save(billing);
      n += 1;
    }
    return n;
  }

  private async getLatestNonCancelledChargeDueYmd(
    condominiumId: string,
  ): Promise<string | null> {
    const ch = await this.chargeRepo.findOne({
      where: { condominiumId, status: Not('cancelled') },
      order: { dueDate: 'DESC' },
    });
    if (!ch?.dueDate) {
      return null;
    }
    return String(ch.dueDate).slice(0, 10);
  }

  async bulkCreateMonthlyCharges(dto: CreateSaasChargeDto): Promise<{
    results: Array<{
      condominiumId: string;
      ok: boolean;
      reused?: boolean;
      error?: string;
      charge?: Record<string, unknown>;
    }>;
  }> {
    const condos = await this.condoRepo.find({ select: ['id'] });
    const results: Array<{
      condominiumId: string;
      ok: boolean;
      reused?: boolean;
      error?: string;
      charge?: Record<string, unknown>;
    }> = [];
    for (const { id } of condos) {
      try {
        const r = await this.createMonthlyCharge(id, dto);
        results.push({
          condominiumId: id,
          ok: true,
          reused: r.reused,
          charge: r.charge,
        });
      } catch (e) {
        const err = e as { message?: string; getResponse?: () => unknown };
        let msg = err?.message ?? 'Erro desconhecido.';
        if (typeof err?.getResponse === 'function') {
          const body = err.getResponse();
          if (typeof body === 'object' && body && 'message' in body) {
            const m = (body as { message: unknown }).message;
            msg = Array.isArray(m) ? m.join(' ') : String(m);
          }
        }
        results.push({ condominiumId: id, ok: false, error: msg });
      }
    }
    return { results };
  }

  private defaultDueDateIso(): string {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().slice(0, 10);
  }

  private currentReferenceMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private serializeCharge(ch: SaasCharge): Record<string, unknown> {
    return {
      id: ch.id,
      condominiumId: ch.condominiumId,
      referenceMonth: ch.referenceMonth,
      amountCents: ch.amountCents,
      dueDate: ch.dueDate,
      status: ch.status,
      asaasPaymentId: ch.asaasPaymentId,
      invoiceUrl: ch.invoiceUrl,
      bankSlipUrl: ch.bankSlipUrl,
      pixQrPayload: ch.pixQrPayload,
      paidAt: ch.paidAt,
      createdAt: ch.createdAt,
      updatedAt: ch.updatedAt,
    };
  }
}
