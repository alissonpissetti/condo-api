import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  drawDocumentHeaderLogo,
  installPlatformWatermarkUnderAllContent,
  stampPlatformFooterOnAllPages,
} from '../common/pdf-branding';
import { CondominiumsService } from '../condominiums/condominiums.service';
import type { CondoAccess } from '../planning/governance.service';
import { GovernanceService } from '../planning/governance.service';
import { GovernanceRole } from '../planning/enums/governance-role.enum';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
import {
  CondominiumFeeChargePaymentLog,
  type CondominiumFeeChargePaymentLogAction,
} from './entities/condominium-fee-charge-payment-log.entity';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { TransactionUnitShare } from './entities/transaction-unit-share.entity';
import { Unit } from '../units/unit.entity';
import { FundAccrualService } from './fund-accrual.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import {
  formatDateOnlyYmdUtc,
  parseDateOnlyFromApi,
  todayLocalCalendarAsUtcNoon,
} from './date-only.util';
import { normalizeBrCellphone } from '../lib/phone-br';
import { TwilioWhatsappService } from '../twilio-whatsapp/twilio-whatsapp.service';
import { MonthlyTransparencyPdfService } from './monthly-transparency-pdf.service';
import { SendFeeSlipsWhatsappDto } from './dto/send-fee-slips-whatsapp.dto';
import { groupingFeeEquivalenceKey } from './fee-equivalence.util';
import { resolveUnitFinancialResponsibleDisplayName } from '../units/unit-financial-responsible.util';
import {
  dueDateForCompetenceYm,
  firstDayOfCompetenceYm,
  isValidCompetenceYm,
  lastDayOfCompetenceYm,
} from './finance-competence.util';

const UNIT_REL_FOR_FEE_VIEW = {
  grouping: true,
  ownerPerson: true,
  financialResponsiblePerson: true,
  responsibleLinks: { person: true },
} as const;

export interface CondominiumFeeChargePaymentLogView {
  id: string;
  action: CondominiumFeeChargePaymentLogAction;
  actorUserId: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface CondominiumFeeChargeView {
  id: string;
  competenceYm: string;
  unitId: string;
  unitIdentifier: string;
  groupingName: string;
  amountDueCents: string;
  dueOn: string;
  status: 'open' | 'paid';
  paidAt: string | null;
  incomeTransactionId: string | null;
  /** `true` quando houver um comprovante (imagem/PDF) anexado ao quitar. */
  hasPaymentReceipt: boolean;
  /**
   * Nome único para contexto financeiro (responsável financeiro da unidade,
   * ou único responsável, ou rótulo livre). `null` se houver vários responsáveis
   * sem designação.
   */
  financialResponsibleName: string | null;
}

export interface FeeSlipWhatsappSkip {
  unitId: string;
  unitIdentifier: string;
  reason: string;
}

export interface FeeSlipWhatsappFailure {
  unitId: string;
  unitIdentifier: string;
  error: string;
}

export interface SendFeeSlipsWhatsappResult {
  sent: number;
  skipped: FeeSlipWhatsappSkip[];
  failures: FeeSlipWhatsappFailure[];
}

@Injectable()
export class CondominiumFeesService {
  constructor(
    @InjectRepository(CondominiumFeeCharge)
    private readonly chargeRepo: Repository<CondominiumFeeCharge>,
    @InjectRepository(CondominiumFeeChargePaymentLog)
    private readonly feePaymentLogRepo: Repository<CondominiumFeeChargePaymentLog>,
    @InjectRepository(TransactionUnitShare)
    private readonly shareRepo: Repository<TransactionUnitShare>,
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    private readonly condominiumsService: CondominiumsService,
    private readonly governance: GovernanceService,
    private readonly fundAccrual: FundAccrualService,
    @Inject(RECEIPT_STORAGE) private readonly storage: ReceiptStoragePort,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly twilioWhatsapp: TwilioWhatsappService,
    private readonly monthlyTransparencyPdf: MonthlyTransparencyPdfService,
  ) {}

  async listCharges(
    condominiumId: string,
    userId: string,
    competenceYm: string,
  ): Promise<CondominiumFeeChargeView[]> {
    const { unitIds } = await this.feeChargesScope(condominiumId, userId);
    if (!competenceYm?.trim()) {
      throw new BadRequestException('competenceYm query is required');
    }
    const ym = competenceYm.trim();
    this.assertYm(ym);

    if (unitIds !== null && unitIds.length === 0) {
      return [];
    }

    const qb = this.chargeRepo
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.unit', 'u')
      .innerJoinAndSelect('u.grouping', 'g')
      .where('c.condominium_id = :cid', { cid: condominiumId })
      .andWhere('c.competence_ym = :ym', { ym })
      .orderBy('g.name', 'ASC')
      .addOrderBy('u.identifier', 'ASC');
    if (unitIds !== null) {
      qb.andWhere('c.unit_id IN (:...uids)', { uids: unitIds });
    }

    const rows = await qb.getMany();
    const uids = [...new Set(rows.map((r) => r.unitId))];
    if (uids.length > 0) {
      const units = await this.unitRepo.find({
        where: { id: In(uids) },
        relations: UNIT_REL_FOR_FEE_VIEW,
      });
      const map = new Map(units.map((uu) => [uu.id, uu]));
      for (const c of rows) {
        const u = map.get(c.unitId);
        if (u) {
          c.unit = u;
        }
      }
    }
    return rows.map((c) => this.toView(c));
  }

  /**
   * PDF slip/capa PIX para download público (token JWT). Usado pelo Twilio `mediaUrl`.
   */
  async getFeeSlipPdfBufferFromPublicToken(token: string): Promise<Buffer> {
    type Payload = {
      p: string;
      cid: string;
      uid: string;
      ym: string;
      aid: string;
    };
    let payload: Payload;
    try {
      payload = await this.jwtService.verifyAsync<Payload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
    if (payload.p !== 'fee_slip') {
      throw new UnauthorizedException('Token inválido.');
    }
    return this.monthlyTransparencyPdf.buildClosingTransparencyPdf(
      payload.cid,
      payload.aid,
      payload.ym,
      payload.uid,
    );
  }

  /**
   * Envia por WhatsApp (Twilio) o PDF de transparência com capa slip PIX por unidade.
   * Requer `PUBLIC_BASE_URL` (HTTPS) acessível pela Twilio e credenciais WhatsApp.
   */
  async sendFeeSlipsWhatsapp(
    condominiumId: string,
    userId: string,
    dto: SendFeeSlipsWhatsappDto,
  ): Promise<SendFeeSlipsWhatsappResult> {
    await this.governance.assertManagement(condominiumId, userId);
    const ym = dto.competenceYm.trim();
    this.assertYm(ym);

    const publicBase = (
      this.config.get<string>('PUBLIC_BASE_URL')?.trim() ||
      this.config.get<string>('API_PUBLIC_BASE_URL')?.trim() ||
      this.config.get<string>('BACKEND_PUBLIC_URL')?.trim()
    )?.replace(/\/+$/, '');
    if (!publicBase) {
      throw new BadRequestException(
        'Configure API_PUBLIC_BASE_URL ou BACKEND_PUBLIC_URL (URL HTTPS pública desta API, sem barra final) para o WhatsApp poder obter o PDF. Opcionalmente use PUBLIC_BASE_URL.',
      );
    }
    if (!this.twilioWhatsapp.canSendArbitraryWhatsapp()) {
      throw new ServiceUnavailableException(
        'WhatsApp (Twilio) não configurado: defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM.',
      );
    }

    const condo = await this.condominiumsService.findOneForManagement(
      condominiumId,
      userId,
    );
    const condoName = condo.name?.trim() || 'Condomínio';

    const qb = this.chargeRepo
      .createQueryBuilder('c')
      .where('c.condominium_id = :cid', { cid: condominiumId })
      .andWhere('c.competence_ym = :ym', { ym })
      .andWhere('c.status = :st', { st: 'open' });
    const filterIds = dto.unitIds?.map((x) => x.trim()).filter(Boolean) ?? [];
    if (filterIds.length > 0) {
      qb.andWhere('c.unit_id IN (:...uids)', { uids: filterIds });
    }
    const charges = await qb.getMany();
    const unitIds = [...new Set(charges.map((c) => c.unitId))];

    const skipped: FeeSlipWhatsappSkip[] = [];
    const failures: FeeSlipWhatsappFailure[] = [];
    let sent = 0;

    const unitRel = {
      grouping: true,
      ownerPerson: true,
      financialResponsiblePerson: true,
      responsibleLinks: { person: true },
    } as const;

    for (const uid of unitIds) {
      const unit = await this.unitRepo.findOne({
        where: { id: uid },
        relations: unitRel,
      });
      if (!unit) {
        skipped.push({
          unitId: uid,
          unitIdentifier: '—',
          reason: 'Unidade não encontrada.',
        });
        continue;
      }
      const unitLabel =
        `${unit.identifier} · ${unit.grouping?.name ?? ''}`.trim();
      const phone = this.resolveFeeSlipWhatsappPhone(unit);
      if (!phone) {
        skipped.push({
          unitId: uid,
          unitIdentifier: unit.identifier,
          reason:
            'Sem número de celular (responsável financeiro, proprietário, responsáveis ou WhatsApp de referência na unidade).',
        });
        continue;
      }

      const token = await this.jwtService.signAsync(
        {
          p: 'fee_slip',
          cid: condominiumId,
          uid,
          ym,
          aid: userId,
        },
        { expiresIn: '25m' },
      );
      const mediaUrl = `${publicBase}/public/fee-slip.pdf?token=${encodeURIComponent(token)}`;
      const fallbackBody = `${condoName} — ${unitLabel} — Taxa ${ym}. Segue o PDF (slip PIX e relatório).`;

      try {
        await this.twilioWhatsapp.sendFeeSlipWhatsapp(phone, {
          condominiumName: condoName,
          unitLabel,
          competenceYm: ym,
          mediaUrl,
          fallbackBody,
        });
        sent += 1;
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : 'Falha ao enviar pelo WhatsApp (Twilio).';
        failures.push({
          unitId: uid,
          unitIdentifier: unit.identifier,
          error: msg,
        });
      }
    }

    return { sent, skipped, failures };
  }

  private normalizePhoneForWa(raw: string | null | undefined): string | null {
    if (!raw?.trim()) {
      return null;
    }
    return normalizeBrCellphone(raw.trim());
  }

  /**
   * Celular em formato 55… para WhatsApp: financeiro → proprietário → responsáveis → referência.
   */
  private resolveFeeSlipWhatsappPhone(unit: Unit): string | null {
    const fin = this.normalizePhoneForWa(
      unit.financialResponsiblePerson?.phone ?? undefined,
    );
    if (fin) {
      return fin;
    }
    const own = this.normalizePhoneForWa(unit.ownerPerson?.phone ?? undefined);
    if (own) {
      return own;
    }
    for (const l of unit.responsibleLinks ?? []) {
      const p = this.normalizePhoneForWa(l.person?.phone ?? undefined);
      if (p) {
        return p;
      }
    }
    const pending = unit.pendingWhatsappPhone?.trim();
    if (pending) {
      return normalizeBrCellphone(pending);
    }
    return null;
  }

  async closeMonth(
    condominiumId: string,
    userId: string,
    competenceYm: string,
  ): Promise<CondominiumFeeChargeView[]> {
    await this.governance.assertManagement(condominiumId, userId);
    this.assertYm(competenceYm);
    await this.closeMonthInternal(condominiumId, competenceYm);
    return this.listCharges(condominiumId, userId, competenceYm);
  }

  /** Usado pelo cron (sem usuário). */
  async closeMonthInternal(
    condominiumId: string,
    competenceYm: string,
  ): Promise<void> {
    this.assertYm(competenceYm);
    await this.fundAccrual.ensureAccrualsForCompetence(
      condominiumId,
      competenceYm,
    );
    const rawByUnit = await this.sumSharesByUnit(condominiumId, competenceYm);
    const unitsInGroups = await this.getUnitsWithGrouping(condominiumId);
    const billedByUnit = this.equalizeAmountPerGrouping(rawByUnit, unitsInGroups);
    const dueOn = dueDateForCompetenceYm(competenceYm);

    for (const { unitId } of unitsInGroups) {
      const existing = await this.chargeRepo.findOne({
        where: {
          condominiumId,
          competenceYm,
          unitId,
        },
      });
      if (existing?.status === 'paid') {
        continue;
      }
      const amountDue = billedByUnit.get(unitId) ?? 0n;
      if (existing) {
        existing.amountDueCents = amountDue.toString();
        existing.dueOn = dueOn;
        await this.chargeRepo.save(existing);
      } else {
        await this.chargeRepo.save(
          this.chargeRepo.create({
            condominiumId,
            competenceYm,
            unitId,
            amountDueCents: amountDue.toString(),
            dueOn,
            status: 'open',
            paidAt: null,
            incomeTransactionId: null,
          }),
        );
      }
    }
  }

  async regenerateMonth(
    condominiumId: string,
    userId: string,
    competenceYm: string,
  ): Promise<CondominiumFeeChargeView[]> {
    await this.governance.assertManagement(condominiumId, userId);
    this.assertYm(competenceYm);

    const paidCount = await this.chargeRepo.count({
      where: {
        condominiumId,
        competenceYm,
        status: 'paid',
      },
    });
    if (paidCount > 0) {
      throw new BadRequestException(
        'Não é possível regenerar: existem cobranças quitadas neste mês. Reabra o pagamento (POST …/reopen-payment) nas cobranças necessárias e tente de novo.',
      );
    }

    await this.chargeRepo.delete({ condominiumId, competenceYm });
    await this.fundAccrual.removeAccrualsForCompetence(
      condominiumId,
      competenceYm,
    );
    await this.fundAccrual.ensureAccrualsForCompetence(
      condominiumId,
      competenceYm,
    );
    const rawByUnit = await this.sumSharesByUnit(condominiumId, competenceYm);
    const unitsInGroups = await this.getUnitsWithGrouping(condominiumId);
    const billedByUnit = this.equalizeAmountPerGrouping(rawByUnit, unitsInGroups);
    const dueOn = dueDateForCompetenceYm(competenceYm);

    for (const { unitId } of unitsInGroups) {
      const amountDue = billedByUnit.get(unitId) ?? 0n;
      await this.chargeRepo.save(
        this.chargeRepo.create({
          condominiumId,
          competenceYm,
          unitId,
          amountDueCents: amountDue.toString(),
          dueOn,
          status: 'open',
          paidAt: null,
          incomeTransactionId: null,
        }),
      );
    }

    return this.listCharges(condominiumId, userId, competenceYm);
  }

  async settle(
    condominiumId: string,
    userId: string,
    chargeId: string,
    incomeTransactionId?: string,
    paymentReceiptStorageKey?: string | null,
  ): Promise<CondominiumFeeChargeView> {
    await this.governance.assertManagement(condominiumId, userId);
    const charge = await this.chargeRepo.findOne({
      where: { id: chargeId, condominiumId },
      relations: { unit: UNIT_REL_FOR_FEE_VIEW },
    });
    if (!charge) {
      throw new NotFoundException('Charge not found');
    }
    if (charge.status !== 'open') {
      throw new BadRequestException('Charge is not open');
    }

    const receiptKey = paymentReceiptStorageKey?.trim() || null;
    if (receiptKey) {
      await this.storage.assertReceiptExists(condominiumId, receiptKey);
    }

    const txId = incomeTransactionId?.trim();

    if (txId) {
      const tx = await this.txRepo.findOne({
        where: { id: txId, condominiumId },
        relations: { unitShares: true },
      });
      if (!tx) {
        throw new NotFoundException('Transaction not found');
      }
      if (tx.kind !== 'income') {
        throw new BadRequestException('Transaction must be income');
      }
      const share = tx.unitShares?.find((s) => s.unitId === charge.unitId);
      if (!share) {
        throw new BadRequestException(
          'Income transaction has no allocation for this unit',
        );
      }
      const shareAbs = -BigInt(share.shareCents);
      const due = BigInt(charge.amountDueCents);
      if (shareAbs !== due) {
        throw new BadRequestException(
          'Income amount allocated to this unit does not match charge',
        );
      }

      charge.status = 'paid';
      charge.incomeTransactionId = tx.id;
      charge.paidAt =
        tx.occurredOn instanceof Date
          ? tx.occurredOn
          : parseDateOnlyFromApi(String(tx.occurredOn));
    } else {
      charge.status = 'paid';
      charge.incomeTransactionId = null;
      charge.paidAt = todayLocalCalendarAsUtcNoon();
    }

    charge.paymentReceiptStorageKey = receiptKey;

    await this.chargeRepo.save(charge);
    const fresh = await this.chargeRepo.findOne({
      where: { id: charge.id, condominiumId },
      relations: { unit: UNIT_REL_FOR_FEE_VIEW },
    });
    if (!fresh) {
      throw new NotFoundException('Charge not found');
    }
    return this.toView(fresh);
  }

  /**
   * Reabre uma cobrança quitada: volta a «em aberto», desvincula receita e anexo
   * actual, registando um histórico com o estado anterior (ficheiros no storage
   * mantêm-se para auditoria; a chave antiga fica no log).
   */
  async reopenPayment(
    condominiumId: string,
    userId: string,
    chargeId: string,
    reason?: string | null,
  ): Promise<CondominiumFeeChargeView> {
    await this.governance.assertManagement(condominiumId, userId);
    const charge = await this.chargeRepo.findOne({
      where: { id: chargeId, condominiumId },
      relations: { unit: UNIT_REL_FOR_FEE_VIEW },
    });
    if (!charge) {
      throw new NotFoundException('Cobrança não encontrada.');
    }
    if (charge.status !== 'paid') {
      throw new BadRequestException(
        'Só é possível reabrir uma cobrança já quitada.',
      );
    }

    const detail: Record<string, unknown> = {
      reason: reason?.trim() || null,
      previousPaidAt: charge.paidAt
        ? formatDateOnlyYmdUtc(charge.paidAt)
        : null,
      previousIncomeTransactionId: charge.incomeTransactionId,
      previousReceiptKey: charge.paymentReceiptStorageKey,
    };

    await this.chargeRepo.manager.transaction(async (mgr) => {
      await mgr.save(
        mgr.create(CondominiumFeeChargePaymentLog, {
          chargeId: charge.id,
          actorUserId: userId,
          action: 'payment_reopened',
          detail,
        }),
      );
      charge.status = 'open';
      charge.paidAt = null;
      charge.incomeTransactionId = null;
      charge.paymentReceiptStorageKey = null;
      await mgr.save(charge);
    });

    const fresh = await this.chargeRepo.findOne({
      where: { id: charge.id, condominiumId },
      relations: { unit: UNIT_REL_FOR_FEE_VIEW },
    });
    if (!fresh) {
      throw new NotFoundException('Cobrança não encontrada.');
    }
    return this.toView(fresh);
  }

  /**
   * Troca só o anexo de comprovante (quitação) numa cobrança ainda quitada.
   * O ficheiro deve ter sido enviado antes (`transaction-receipts`); usa
   * `RECEIPT_STORAGE` (local ou Nextcloud). Remove o ficheiro antigo do storage.
   */
  async replacePaymentReceipt(
    condominiumId: string,
    userId: string,
    chargeId: string,
    newReceiptKey: string,
  ): Promise<CondominiumFeeChargeView> {
    await this.governance.assertManagement(condominiumId, userId);
    const key = newReceiptKey.trim();
    if (!this.storage.isValidReceiptKey(key)) {
      throw new BadRequestException('Chave de comprovante inválida.');
    }
    await this.storage.assertReceiptExists(condominiumId, key);

    const charge = await this.chargeRepo.findOne({
      where: { id: chargeId, condominiumId },
      relations: { unit: UNIT_REL_FOR_FEE_VIEW },
    });
    if (!charge) {
      throw new NotFoundException('Cobrança não encontrada.');
    }
    if (charge.status !== 'paid') {
      throw new BadRequestException(
        'Só é possível substituir o anexo numa cobrança quitada.',
      );
    }

    const oldKey = charge.paymentReceiptStorageKey;
    if (oldKey === key) {
      throw new BadRequestException('O anexo indicado já é o actual.');
    }

    const detail: Record<string, unknown> = {
      previousReceiptKey: oldKey,
      newReceiptKey: key,
    };

    await this.chargeRepo.manager.transaction(async (mgr) => {
      await mgr.save(
        mgr.create(CondominiumFeeChargePaymentLog, {
          chargeId: charge.id,
          actorUserId: userId,
          action: 'receipt_replaced',
          detail,
        }),
      );
      charge.paymentReceiptStorageKey = key;
      await mgr.save(charge);
    });

    if (oldKey) {
      await this.storage.deleteReceipt(condominiumId, oldKey);
    }

    const fresh = await this.chargeRepo.findOne({
      where: { id: charge.id, condominiumId },
      relations: { unit: UNIT_REL_FOR_FEE_VIEW },
    });
    if (!fresh) {
      throw new NotFoundException('Cobrança não encontrada.');
    }
    return this.toView(fresh);
  }

  async listPaymentHistory(
    condominiumId: string,
    userId: string,
    chargeId: string,
  ): Promise<CondominiumFeeChargePaymentLogView[]> {
    await this.governance.assertManagement(condominiumId, userId);
    const charge = await this.chargeRepo.findOne({
      where: { id: chargeId, condominiumId },
    });
    if (!charge) {
      throw new NotFoundException('Cobrança não encontrada.');
    }
    const rows = await this.feePaymentLogRepo.find({
      where: { chargeId: charge.id },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorUserId: r.actorUserId,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Atualiza em massa a data de vencimento de uma ou mais cobranças da competência.
   * Só pode ser executada por quem tem papel de gestão e apenas em cobranças
   * pertencentes ao condomínio informado. A data é gravada como coluna `date`
   * (meio-dia UTC do calendário civil).
   */
  async updateChargesDueDate(
    condominiumId: string,
    userId: string,
    chargeIds: string[],
    dueOnYmd: string,
  ): Promise<CondominiumFeeChargeView[]> {
    await this.governance.assertManagement(condominiumId, userId);

    if (!Array.isArray(chargeIds) || chargeIds.length === 0) {
      throw new BadRequestException('chargeIds is required');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOnYmd?.trim() ?? '')) {
      throw new BadRequestException('dueOn must be in AAAA-MM-DD format');
    }

    const uniqueIds = Array.from(new Set(chargeIds));
    const charges = await this.chargeRepo.find({
      where: uniqueIds.map((id) => ({ id, condominiumId })),
    });

    if (charges.length !== uniqueIds.length) {
      const found = new Set(charges.map((c) => c.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Charge(s) not found: ${missing.join(', ')}`,
      );
    }

    const newDue = parseDateOnlyFromApi(dueOnYmd);
    if (Number.isNaN(newDue.getTime())) {
      throw new BadRequestException('dueOn is not a valid date');
    }

    for (const c of charges) {
      c.dueOn = newDue;
    }
    await this.chargeRepo.save(charges);

    const fresh = await this.chargeRepo.find({
      where: uniqueIds.map((id) => ({ id, condominiumId })),
      relations: { unit: UNIT_REL_FOR_FEE_VIEW },
    });
    return fresh.map((c) => this.toView(c));
  }

  async getPaymentReceiptFile(
    condominiumId: string,
    userId: string,
    chargeId: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const { unitIds } = await this.feeChargesScope(condominiumId, userId);
    const charge = await this.chargeRepo.findOne({
      where: { id: chargeId, condominiumId },
    });
    if (!charge) {
      throw new NotFoundException('Charge not found');
    }
    if (unitIds !== null && !unitIds.includes(charge.unitId)) {
      throw new ForbiddenException('Charge not accessible');
    }
    if (!charge.paymentReceiptStorageKey) {
      throw new NotFoundException('Charge has no payment receipt attached');
    }
    return this.storage.readReceipt(
      condominiumId,
      charge.paymentReceiptStorageKey,
    );
  }

  async getPaymentReceiptPdf(
    condominiumId: string,
    userId: string,
    chargeId: string,
  ): Promise<Buffer> {
    const { unitIds } = await this.feeChargesScope(condominiumId, userId);
    const condoItem = await this.condominiumsService.findOneAccessible(
      condominiumId,
      userId,
    );
    const charge = await this.chargeRepo.findOne({
      where: { id: chargeId, condominiumId },
      relations: { unit: UNIT_REL_FOR_FEE_VIEW },
    });
    if (!charge) {
      throw new NotFoundException('Charge not found');
    }
    if (
      unitIds !== null &&
      !unitIds.includes(charge.unitId)
    ) {
      throw new ForbiddenException('Charge not accessible');
    }
    const condo = condoItem;
    if (charge.status !== 'paid') {
      throw new BadRequestException(
        'Charge must be paid to generate a receipt',
      );
    }

    const u = charge.unit;
    const unitLabel = u?.identifier ?? '—';
    const groupingName = u?.grouping?.name ?? '—';
    const financialRefName = u
      ? resolveUnitFinancialResponsibleDisplayName({
          financialResponsiblePerson: u.financialResponsiblePerson ?? null,
          responsibleLinks: u.responsibleLinks ?? null,
          responsibleDisplayName: u.responsibleDisplayName ?? null,
        })
      : null;
    const competenceYm = charge.competenceYm;
    const dueOn = formatDateOnlyYmdUtc(charge.dueOn);
    const paidAt = charge.paidAt
      ? formatDateOnlyYmdUtc(charge.paidAt)
      : '—';
    const amountCents = String(charge.amountDueCents);
    const brl = (Number(amountCents) / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    let managementLogoBuffer: Buffer | null = null;
    if (condo.managementLogoStorageKey) {
      try {
        const img = await this.storage.readManagementLogo(
          condominiumId,
          condo.managementLogoStorageKey,
        );
        managementLogoBuffer = img.buffer;
      } catch {
        managementLogoBuffer = null;
      }
    }

    const margin = 56;
    const footerReserve = 72;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        bufferPages: true,
        margins: {
          top: margin,
          bottom: footerReserve,
          left: margin,
          right: margin,
        },
        info: {
          Title: 'Comprovante — taxa condominial',
          Author: condo.name.slice(0, 120),
        },
      });
      installPlatformWatermarkUnderAllContent(doc);
      const chunks: Buffer[] = [];
      const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;

      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let y = margin;
      y = drawDocumentHeaderLogo(doc, left, y, managementLogoBuffer, 48);
      doc.x = left;
      doc.y = y;

      doc.font('Helvetica-Bold').fontSize(14).text('COMPROVANTE DE PAGAMENTO', {
        align: 'center',
        width: w,
      });
      doc.moveDown(0.3);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#444444')
        .text('Taxa condominial — referência de quitação.', {
          align: 'center',
          width: w,
        });
      doc.fillColor('#000000');
      doc.moveDown(1.2);

      doc.font('Helvetica-Bold').fontSize(11).text('Dados do condomínio');
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(`Nome: ${condo.name}`, { width: w });
      doc.text(`Cobrança (ID interno): ${charge.id}`, { width: w });
      doc.moveDown(0.75);

      doc.font('Helvetica-Bold').fontSize(11).text('Unidade e competência');
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(`Unidade: ${unitLabel}`, { width: w });
      doc.text(`Agrupamento: ${groupingName}`, { width: w });
      if (financialRefName) {
        doc.text(`Responsável (referência financeira): ${financialRefName}`, {
          width: w,
        });
      }
      doc.text(`Competência: ${competenceYm}`, { width: w });
      doc.text(`Vencimento: ${this.ymdToPtBr(dueOn)}`, { width: w });
      doc.moveDown(0.75);

      doc.font('Helvetica-Bold').fontSize(11).text('Valores');
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(`Valor pago: ${brl}`, { width: w });
      doc.text(`Data do pagamento (registro): ${this.ymdToPtBr(paidAt)}`, {
        width: w,
      });
      if (charge.incomeTransactionId) {
        doc.moveDown(0.35);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#555555')
          .text(
            `Transação de receita vinculada: ${charge.incomeTransactionId}`,
            { width: w },
          );
        doc.fillColor('#000000');
      }
      doc.moveDown(1.2);

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#666666')
        .text(
          'Documento emitido eletronicamente para fins de controle interno. Conserve junto aos registros do condomínio.',
          { width: w, align: 'justify' },
        );

      stampPlatformFooterOnAllPages(doc);
      doc.end();
    });
  }

  private ymdToPtBr(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
    if (!m) {
      return ymd;
    }
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  /**
   * `unitIds === null` → vê todas as cobranças (gestão / titular).
   * Caso contrário, só unidades ligadas ao usuário na ficha.
   */
  private async feeChargesScope(
    condominiumId: string,
    userId: string,
  ): Promise<{ unitIds: string[] | null }> {
    const access = await this.governance.assertAnyAccess(condominiumId, userId);
    if (this.seesAllFeeCharges(access)) {
      return { unitIds: null };
    }
    const unitIds = await this.governance.listUnitIdsLinkedToUser(
      condominiumId,
      userId,
    );
    return { unitIds };
  }

  private seesAllFeeCharges(access: CondoAccess): boolean {
    if (access.kind === 'owner') {
      return true;
    }
    if (access.kind === 'participant') {
      return (
        access.role === GovernanceRole.Syndic ||
        access.role === GovernanceRole.SubSyndic ||
        access.role === GovernanceRole.Admin ||
        access.role === GovernanceRole.Owner
      );
    }
    return false;
  }

  private toView(c: CondominiumFeeCharge): CondominiumFeeChargeView {
    const u = c.unit;
    const due = formatDateOnlyYmdUtc(c.dueOn);
    const paid =
      c.paidAt == null ? null : formatDateOnlyYmdUtc(c.paidAt);
    const financialResponsibleName = u
      ? resolveUnitFinancialResponsibleDisplayName({
          financialResponsiblePerson: u.financialResponsiblePerson ?? null,
          responsibleLinks: u.responsibleLinks ?? null,
          responsibleDisplayName: u.responsibleDisplayName ?? null,
        })
      : null;
    return {
      id: c.id,
      competenceYm: c.competenceYm,
      unitId: c.unitId,
      unitIdentifier: u?.identifier ?? '',
      groupingName: u?.grouping?.name ?? '',
      amountDueCents: String(c.amountDueCents),
      dueOn: due,
      status: c.status,
      paidAt: paid,
      incomeTransactionId: c.incomeTransactionId,
      hasPaymentReceipt: !!c.paymentReceiptStorageKey,
      financialResponsibleName,
    };
  }

  private assertYm(ym: string): void {
    if (!isValidCompetenceYm(ym)) {
      throw new BadRequestException('Invalid competenceYm');
    }
  }

  private async getUnitsWithGrouping(
    condominiumId: string,
  ): Promise<
    Array<{ unitId: string; groupingId: string; feeEquivalenceKey: string }>
  > {
    const units = await this.unitRepo.find({
      where: { grouping: { condominiumId } },
      relations: { grouping: true },
      order: { id: 'ASC' },
    });
    return units.map((u) => ({
      unitId: u.id,
      groupingId: u.groupingId,
      feeEquivalenceKey: groupingFeeEquivalenceKey(
        u.grouping?.name,
        u.groupingId,
      ),
    }));
  }

  /**
   * Por **classe de equivalência** (tipo de unidade / nome do agrupamento),
   * todas as unidades passam a ter o mesmo valor devido: o **máximo** das cotas
   * brutas mensais entre unidades daquela classe. Assim, diferenças de centavos
   * vindas de restos de rateio ficam niveladas para cima.
   */
  private equalizeAmountPerGrouping(
    rawByUnit: Map<string, bigint>,
    units: Array<{ unitId: string; feeEquivalenceKey: string }>,
  ): Map<string, bigint> {
    const rawsByKey = new Map<string, bigint[]>();
    for (const { unitId, feeEquivalenceKey } of units) {
      const raw = rawByUnit.get(unitId) ?? 0n;
      const list = rawsByKey.get(feeEquivalenceKey) ?? [];
      list.push(raw);
      rawsByKey.set(feeEquivalenceKey, list);
    }
    const amountForKey = new Map<string, bigint>();
    for (const [key, arr] of rawsByKey) {
      let max = arr[0]!;
      for (let i = 1; i < arr.length; i++) {
        const v = arr[i]!;
        if (v > max) {
          max = v;
        }
      }
      amountForKey.set(key, max);
    }
    const out = new Map<string, bigint>();
    for (const { unitId, feeEquivalenceKey } of units) {
      out.set(unitId, amountForKey.get(feeEquivalenceKey)!);
    }
    return out;
  }

  private async sumSharesByUnit(
    condominiumId: string,
    competenceYm: string,
  ): Promise<Map<string, bigint>> {
    const from = firstDayOfCompetenceYm(competenceYm);
    const to = lastDayOfCompetenceYm(competenceYm);
    const raw = await this.shareRepo
      .createQueryBuilder('s')
      .innerJoin('s.transaction', 't')
      .where('t.condominium_id = :cid', { cid: condominiumId })
      .andWhere('t.occurred_on >= :from', { from })
      .andWhere('t.occurred_on <= :to', { to })
      .select('s.unit_id', 'unitId')
      .addSelect('SUM(s.share_cents)', 'sumCents')
      .groupBy('s.unit_id')
      .getRawMany<{ unitId: string; sumCents: string | null }>();

    const map = new Map<string, bigint>();
    for (const r of raw) {
      const v = r.sumCents ?? '0';
      map.set(r.unitId, BigInt(String(v)));
    }
    return map;
  }
}
