import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  drawDocumentHeaderLogo,
  installPlatformWatermarkUnderAllContent,
  stampPlatformFooterOnAllPages,
} from '../common/pdf-branding';
import { CondominiumsService } from '../condominiums/condominiums.service';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
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
import { groupingFeeEquivalenceKey } from './fee-equivalence.util';
import {
  dueDateForCompetenceYm,
  firstDayOfCompetenceYm,
  isValidCompetenceYm,
  lastDayOfCompetenceYm,
} from './finance-competence.util';

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
}

@Injectable()
export class CondominiumFeesService {
  constructor(
    @InjectRepository(CondominiumFeeCharge)
    private readonly chargeRepo: Repository<CondominiumFeeCharge>,
    @InjectRepository(TransactionUnitShare)
    private readonly shareRepo: Repository<TransactionUnitShare>,
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    private readonly condominiumsService: CondominiumsService,
    private readonly fundAccrual: FundAccrualService,
    @Inject(RECEIPT_STORAGE) private readonly storage: ReceiptStoragePort,
  ) {}

  async listCharges(
    condominiumId: string,
    userId: string,
    competenceYm: string,
  ): Promise<CondominiumFeeChargeView[]> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    if (!competenceYm?.trim()) {
      throw new BadRequestException('competenceYm query is required');
    }
    const ym = competenceYm.trim();
    this.assertYm(ym);

    const rows = await this.chargeRepo
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.unit', 'u')
      .innerJoinAndSelect('u.grouping', 'g')
      .where('c.condominium_id = :cid', { cid: condominiumId })
      .andWhere('c.competence_ym = :ym', { ym })
      .orderBy('g.name', 'ASC')
      .addOrderBy('u.identifier', 'ASC')
      .getMany();

    return rows.map((c) => this.toView(c));
  }

  async closeMonth(
    condominiumId: string,
    userId: string,
    competenceYm: string,
  ): Promise<CondominiumFeeChargeView[]> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    this.assertYm(competenceYm);
    await this.closeMonthInternal(condominiumId, competenceYm);
    return this.listCharges(condominiumId, userId, competenceYm);
  }

  /** Usado pelo cron (sem utilizador). */
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
    await this.condominiumsService.assertOwner(condominiumId, userId);
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
        'Cannot regenerate: there are paid charges for this month. Unlink payments first.',
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
  ): Promise<CondominiumFeeChargeView> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const charge = await this.chargeRepo.findOne({
      where: { id: chargeId, condominiumId },
      relations: { unit: { grouping: true } },
    });
    if (!charge) {
      throw new NotFoundException('Charge not found');
    }
    if (charge.status !== 'open') {
      throw new BadRequestException('Charge is not open');
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

    await this.chargeRepo.save(charge);
    const fresh = await this.chargeRepo.findOne({
      where: { id: charge.id, condominiumId },
      relations: { unit: { grouping: true } },
    });
    if (!fresh) {
      throw new NotFoundException('Charge not found');
    }
    return this.toView(fresh);
  }

  async getPaymentReceiptPdf(
    condominiumId: string,
    userId: string,
    chargeId: string,
  ): Promise<Buffer> {
    await this.condominiumsService.assertOwner(condominiumId, userId);
    const condo = await this.condominiumsService.findOneForOwner(
      condominiumId,
      userId,
    );
    const charge = await this.chargeRepo.findOne({
      where: { id: chargeId, condominiumId },
      relations: { unit: { grouping: true } },
    });
    if (!charge) {
      throw new NotFoundException('Charge not found');
    }
    if (charge.status !== 'paid') {
      throw new BadRequestException(
        'Charge must be paid to generate a receipt',
      );
    }

    const u = charge.unit;
    const unitLabel = u?.identifier ?? '—';
    const groupingName = u?.grouping?.name ?? '—';
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

  private toView(c: CondominiumFeeCharge): CondominiumFeeChargeView {
    const u = c.unit;
    const due = formatDateOnlyYmdUtc(c.dueOn);
    const paid =
      c.paidAt == null ? null : formatDateOnlyYmdUtc(c.paidAt);
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
