import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, Not, Repository } from 'typeorm';
import { CondominiumParticipant } from '../planning/entities/condominium-participant.entity';
import { GovernanceRole } from '../planning/enums/governance-role.enum';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import {
  drawDocumentHeaderLogo,
  installPlatformWatermarkUnderAllContent,
  stampPlatformFooterOnAllPages,
} from '../common/pdf-branding';
import { Grouping } from '../groupings/grouping.entity';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { GovernanceService } from '../planning/governance.service';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { Unit } from '../units/unit.entity';
import {
  formatDateOnlyYmdUtc,
  parseDateOnlyFromApi,
  todayLocalCalendarAsUtcNoon,
} from './date-only.util';
import {
  openFeeLineTypeLabelPt,
  openFeeStatusLabelPt,
} from './open-fee-due.util';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
import { FinancialFund } from './entities/financial-fund.entity';
import { FundMonthlyAccrual } from './entities/fund-monthly-accrual.entity';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { CondominiumBankAccount } from './entities/condominium-bank-account.entity';
import {
  firstDayOfCompetenceYm,
  isValidCompetenceYm,
  lastDayBeforeCompetenceYm,
  lastDayOfCompetenceYm,
} from './finance-competence.util';
import { isAllocationRule } from './allocation.types';
import { distributePositiveCents } from './distribute-cents';
import { groupingFeeEquivalenceKey } from './fee-equivalence.util';
import {
  isExpenseIncludedInCondominiumFee,
} from './condominium-fee-shares.util';
import { resolveUnitFinancialResponsibleDisplayName } from '../units/unit-financial-responsible.util';
import {
  FinanceStatementService,
  type StatementLedgerSection,
  type StatementMovementRow,
} from './finance-statement.service';
import { FundBalanceService } from './fund-balance.service';
import {
  accessAllowsManagement,
  genericFeeMovementTitle,
} from './finance-extrato-display.util';
import {
  buildPixBrCode,
  sanitizePixCity,
  sanitizePixKey,
  sanitizePixMessage,
  sanitizePixName,
} from './pix-br-code.util';
import * as QRCode from 'qrcode';

type UnitCol = {
  unitId: string;
  identifier: string;
  groupingName: string;
  groupingId: string;
  /** Nome único para referência financeira (responsável financeiro, único responsável ou rótulo livre). */
  responsibleName: string | null;
};

type FundPdfRow = {
  id: string;
  name: string;
  allocationSummary: string;
};

type BankAccountPdfRow = {
  id: string;
  /** Apelido da conta no sistema. */
  name: string;
  /** Instituição (lista fixa no cadastro), se informada. */
  bankLabel: string | null;
  openingCents: bigint;
  incomeCents: bigint;
  outflowCents: bigint;
  closingCents: bigint;
};

/** Linha do extrato de fundos no PDF (mesma lógica do extrato mensal do painel). */
type FundExtratoPdfRow = {
  id: string;
  name: string;
  openingCents: bigint;
  incomeCents: bigint;
  expenseCents: bigint;
  closingCents: bigint;
};

type GeneralCashPdfSummary = {
  openingYmd: string;
  closingYmd: string;
  openingCents: bigint;
  closingCents: bigint;
  bankSeedCents: bigint;
  movementsOpeningCents: bigint;
};

/** Unidades listadas por agrupamento (PDF: seção antes dos fundos). */
type AgrupamentosPdfRow = {
  groupingName: string;
  /** Linhas já formatadas (proprietário / responsável / rótulos livres). */
  unitLines: string[];
};

type AdministracaoPdf = {
  syndic: string;
  subSyndic: string;
  administrators: string[];
};

@Injectable()
export class MonthlyTransparencyPdfService {
  constructor(
    @InjectRepository(FinancialTransaction)
    private readonly txRepo: Repository<FinancialTransaction>,
    @InjectRepository(CondominiumFeeCharge)
    private readonly chargeRepo: Repository<CondominiumFeeCharge>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(FinancialFund)
    private readonly fundRepo: Repository<FinancialFund>,
    @InjectRepository(FundMonthlyAccrual)
    private readonly fundAccrualRepo: Repository<FundMonthlyAccrual>,
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    @InjectRepository(CondominiumParticipant)
    private readonly participantRepo: Repository<CondominiumParticipant>,
    @InjectRepository(CondominiumBankAccount)
    private readonly bankAccountRepo: Repository<CondominiumBankAccount>,
    private readonly condominiumsService: CondominiumsService,
    private readonly governance: GovernanceService,
    private readonly fundBalance: FundBalanceService,
    private readonly financeStatement: FinanceStatementService,
    @Inject(RECEIPT_STORAGE) private readonly storage: ReceiptStoragePort,
  ) {}

  async buildClosingTransparencyPdf(
    condominiumId: string,
    userId: string,
    competenceYm: string,
    unitId?: string | null,
  ): Promise<Buffer> {
    const ym = competenceYm?.trim() ?? '';
    if (!ym || !isValidCompetenceYm(ym)) {
      throw new BadRequestException('Invalid competenceYm');
    }

    const targetUnitId = unitId?.trim() || null;
    let anonymizeFeeMovements = true;
    if (targetUnitId) {
      await this.assertUnitAccess(condominiumId, userId, targetUnitId);
    } else {
      const access = await this.governance.assertManagement(
        condominiumId,
        userId,
      );
      anonymizeFeeMovements = !accessAllowsManagement(access);
    }
    const condo = await this.condominiumsService.findById(condominiumId);
    if (!condo) {
      throw new NotFoundException('Condominium not found');
    }

    const fromStr = firstDayOfCompetenceYm(ym);
    const toStr = lastDayOfCompetenceYm(ym);
    const from = parseDateOnlyFromApi(fromStr);
    const to = parseDateOnlyFromApi(toStr);

    const allUnitCols = await this.loadUnitColumns(condominiumId);
    if (allUnitCols.length === 0) {
      throw new BadRequestException(
        'No units in condominium for transparency report',
      );
    }
    const unitCols = allUnitCols;
    const targetUnit = targetUnitId
      ? (allUnitCols.find((u) => u.unitId === targetUnitId) ?? null)
      : null;
    if (targetUnitId && !targetUnit) {
      throw new NotFoundException('Unit not found in condominium');
    }

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

    const statement = await this.financeStatement.statement(
      condominiumId,
      userId,
      fromStr,
      toStr,
    );
    const statementFundSections = [...statement.funds].sort((a, b) =>
      (a.fundName ?? '').localeCompare(b.fundName ?? '', 'pt', {
        sensitivity: 'base',
      }),
    );

    /** Quando o PDF é pedido com `unitId`, o slip PIX deve refletir todas as taxas em aberto (soma e detalhe), não só a competência do relatório. */
    let openChargesForTargetPix: CondominiumFeeCharge[] = [];
    if (targetUnitId) {
      openChargesForTargetPix = await this.chargeRepo.find({
        where: { condominiumId, unitId: targetUnitId, status: 'open' },
        relations: { unit: { grouping: true } },
        order: { competenceYm: 'ASC' },
      });
    }

    const [
      administracao,
      competenceCharges,
      periodExpenseTxs,
      fundMensalidadeTxs,
    ] = await Promise.all([
      this.loadAdministracaoForPdf(condominiumId),
      this.chargeRepo.find({
        where: { condominiumId, competenceYm: ym },
      }),
      this.txRepo.find({
        where: {
          condominiumId,
          occurredOn: Between(from, to),
          paymentStatus: Not('cancelled'),
          kind: In(['expense', 'investment']),
        },
        relations: { unitShares: true, fund: true },
        order: { occurredOn: 'ASC', createdAt: 'ASC' },
      }),
      this.loadFundMensalidadeTransactionsForUnitExtrato(
        condominiumId,
        ym,
      ),
    ]);
    const agrupamentosRows = this.buildAgrupamentosPdfRows(allUnitCols);
    const unitExtratoTxs = periodExpenseTxs.filter((t) =>
      isExpenseIncludedInCondominiumFee(t),
    );
    const fixos = unitExtratoTxs.filter((t) => t.recurringSeriesId != null);
    const variavel = unitExtratoTxs.filter((t) => t.recurringSeriesId == null);

    return await this.renderPdf({
      condoName: condo.name,
      competenceYm: ym,
      periodLabel: this.formatExpensePeriodLabelPtBr(fromStr, toStr),
      managementLogoBuffer,
      competenceYmPtBr: this.formatCompetenceYmPtBr(ym),
      unitCols: allUnitCols,
      targetUnit,
      billingPixKey: condo.billingPixKey,
      billingPixBeneficiaryName: condo.billingPixBeneficiaryName,
      billingPixCity: condo.billingPixCity,
      transparencyPdfIncludePixQrCode:
        condo.transparencyPdfIncludePixQrCode !== false,
      syndicWhatsappForReceipts: condo.syndicWhatsappForReceipts,
      openChargesForTargetPix,
      competenceCharges,
      fixos,
      variavel,
      fundMensalidadeTxs,
      administracao,
      agrupamentosRows,
      statementGeneral: statement.general,
      statementFundSections,
      anonymizeFeeMovements,
    });
  }

  /** Agrupamentos com lista de unidades (seção do slip por unidade). */
  private buildAgrupamentosPdfRows(unitCols: UnitCol[]): AgrupamentosPdfRow[] {
    const byGroup = new Map<string, UnitCol[]>();
    for (const u of unitCols) {
      const g = u.groupingName?.trim() || '—';
      const list = byGroup.get(g) ?? [];
      list.push(u);
      byGroup.set(g, list);
    }
    return [...byGroup.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pt', { sensitivity: 'base' }))
      .map(([groupingName, units]) => ({
        groupingName,
        unitLines: [...units]
          .sort((a, b) =>
            a.identifier.localeCompare(b.identifier, 'pt', {
              sensitivity: 'base',
            }),
          )
          .map((u) => {
            const id = u.identifier?.trim() || '—';
            const resp = u.responsibleName?.trim();
            return resp ? `${id} — ${resp}` : id;
          }),
      }));
  }

  private async loadBankAccountsPdfData(
    condominiumId: string,
    from: Date,
    to: Date,
    competenceYm: string,
  ): Promise<BankAccountPdfRow[]> {
    const openingYmd = lastDayBeforeCompetenceYm(competenceYm);
    const accounts = await this.bankAccountRepo.find({
      where: { condominiumId, isActive: true },
      order: { name: 'ASC', createdAt: 'ASC' },
    });
    if (accounts.length === 0) {
      return [];
    }

    const periodTxs = await this.txRepo.find({
      where: {
        condominiumId,
        bankAccountId: Not(IsNull()),
        occurredOn: Between(from, to),
        paymentStatus: Not('cancelled'),
      },
      select: {
        id: true,
        bankAccountId: true,
        kind: true,
        amountCents: true,
      },
    });
    const periodFees = await this.chargeRepo.find({
      where: {
        condominiumId,
        bankAccountId: Not(IsNull()),
        status: 'paid',
        paidAt: Between(from, to),
        incomeTransactionId: IsNull(),
      },
      select: { id: true, bankAccountId: true, amountDueCents: true },
    });

    const incomeByAccount = new Map<string, bigint>();
    const outflowByAccount = new Map<string, bigint>();
    const bump = (
      map: Map<string, bigint>,
      accountId: string,
      delta: bigint,
    ): void => {
      map.set(accountId, (map.get(accountId) ?? 0n) + delta);
    };

    for (const t of periodTxs) {
      if (!t.bankAccountId) {
        continue;
      }
      const d = this.fundBalance.signedDeltaCents(t);
      if (d > 0n) {
        bump(incomeByAccount, t.bankAccountId, d);
      } else if (d < 0n) {
        bump(outflowByAccount, t.bankAccountId, -d);
      }
    }
    for (const c of periodFees) {
      if (!c.bankAccountId) {
        continue;
      }
      bump(
        incomeByAccount,
        c.bankAccountId,
        BigInt(String(c.amountDueCents)),
      );
    }

    const rows: BankAccountPdfRow[] = [];
    for (const acc of accounts) {
      const openingCents = await this.fundBalance.bankAccountBalanceAsOf(
        condominiumId,
        acc.id,
        openingYmd,
      );
      const incomeCents = incomeByAccount.get(acc.id) ?? 0n;
      const outflowCents = outflowByAccount.get(acc.id) ?? 0n;
      rows.push({
        id: acc.id,
        name: acc.name.trim() || '—',
        bankLabel: acc.bankName?.trim() || null,
        openingCents,
        incomeCents,
        outflowCents,
        closingCents: openingCents + incomeCents - outflowCents,
      });
    }
    return rows;
  }

  private buildFundExtratoRowsFromStatement(
    funds: FinancialFund[],
    sections: StatementLedgerSection[],
  ): FundExtratoPdfRow[] {
    return funds.map((f) => {
      const sec = sections.find((s) => s.fundId === f.id);
      const opening = BigInt(sec?.openingBalanceCents ?? '0');
      let incomeCents = 0n;
      let expenseCents = 0n;
      for (const m of sec?.movements ?? []) {
        const d = BigInt(m.signedDeltaCents);
        if (d > 0n) {
          incomeCents += d;
        } else if (d < 0n) {
          expenseCents += -d;
        }
      }
      const closing = BigInt(sec?.closingBalanceCents ?? opening.toString());
      return {
        id: f.id,
        name: f.name,
        openingCents: opening,
        incomeCents,
        expenseCents,
        closingCents: closing,
      };
    });
  }

  private buildGeneralCashFromStatement(
    competenceYm: string,
    general: StatementLedgerSection,
  ): GeneralCashPdfSummary {
    const openingYmd = lastDayBeforeCompetenceYm(competenceYm);
    const closingYmd = lastDayOfCompetenceYm(competenceYm);
    const bankSeed = BigInt(general.bankAccountsSeedCents ?? '0');
    const openingCents = BigInt(general.openingBalanceCents);
    const closingCents = BigInt(general.closingBalanceCents);
    return {
      openingYmd,
      closingYmd,
      openingCents,
      closingCents,
      bankSeedCents: bankSeed,
      movementsOpeningCents: BigInt(
        general.movementsOpeningBalanceCents ?? (openingCents - bankSeed).toString(),
      ),
    };
  }

  /**
   * Libera acesso ao PDF por unidade para gestão (síndico/subsíndico/admin/
   * titular) ou para o condômino com vínculo de conta à unidade (ficha de
   * proprietário ou responsável). Caso contrário, lança 403.
   */
  private async assertUnitAccess(
    condominiumId: string,
    userId: string,
    unitId: string,
  ): Promise<void> {
    const access = await this.governance.assertAnyAccess(condominiumId, userId);
    const isManagement =
      access.kind === 'owner' ||
      (access.kind === 'participant' &&
        (access.role === GovernanceRole.Owner ||
          access.role === GovernanceRole.Syndic ||
          access.role === GovernanceRole.SubSyndic ||
          access.role === GovernanceRole.Admin));
    if (isManagement) {
      return;
    }
    const linked = await this.governance.listUnitIdsLinkedToUser(
      condominiumId,
      userId,
    );
    if (!linked.includes(unitId)) {
      throw new ForbiddenException('Unit not accessible to this user');
    }
  }

  private describeFundAllocation(
    fund: FinancialFund,
    groupingNameById: Map<string, string>,
    unitById: Map<string, Unit>,
    allUnits: Unit[],
  ): string {
    const r = fund.allocationRule;
    if (!r || !isAllocationRule(r)) {
      return 'Rateio não definido ou inválido.';
    }
    switch (r.kind) {
      case 'none':
        return 'Sem repartição entre unidades.';
      case 'all_units_equal': {
        const names = [
          ...new Set(
            allUnits.map((u) => u.grouping?.name?.trim() || '—'),
          ),
        ].sort((a, b) => a.localeCompare(b, 'pt'));
        return `Todas as unidades em partes iguais. Agrupamentos abrangidos: ${names.join(', ')}.`;
      }
      case 'grouping_ids': {
        const labels = [...r.groupingIds]
          .map((id) => groupingNameById.get(id) ?? id)
          .sort((a, b) => a.localeCompare(b, 'pt'));
        return `Apenas estes agrupamentos no rateio: ${labels.join(', ')}.`;
      }
      case 'unit_ids': {
        const parts = [...r.unitIds]
          .map((id) => {
            const u = unitById.get(id);
            if (!u) {
              return id;
            }
            const g = u.grouping?.name?.trim() || '—';
            return `${u.identifier} (agrup. ${g})`;
          })
          .sort((a, b) => a.localeCompare(b, 'pt'));
        return `Unidades incluídas: ${parts.join('; ')}.`;
      }
      case 'all_units_except': {
        const parts = [...r.excludeUnitIds]
          .map((id) => {
            const u = unitById.get(id);
            if (!u) {
              return id;
            }
            const g = u.grouping?.name?.trim() || '—';
            return `${u.identifier} (agrup. ${g})`;
          })
          .sort((a, b) => a.localeCompare(b, 'pt'));
        return `Todas as unidades exceto: ${parts.join('; ')}.`;
      }
      default:
        return '—';
    }
  }

  private participantDisplayName(p: CondominiumParticipant): string {
    const n = p.person?.fullName?.trim();
    if (n) {
      return n;
    }
    const e = p.user?.email?.trim();
    if (e) {
      return e;
    }
    return '—';
  }

  private async loadAdministracaoForPdf(
    condominiumId: string,
  ): Promise<AdministracaoPdf> {
    const rows = await this.participantRepo.find({
      where: {
        condominiumId,
        role: In([
          GovernanceRole.Syndic,
          GovernanceRole.SubSyndic,
          GovernanceRole.Admin,
        ]),
      },
      relations: { person: true, user: true },
    });
    const syndic = rows.find((r) => r.role === GovernanceRole.Syndic);
    const sub = rows.find((r) => r.role === GovernanceRole.SubSyndic);
    const administrators = rows
      .filter((r) => r.role === GovernanceRole.Admin)
      .map((r) => this.participantDisplayName(r))
      .sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' }));
    return {
      syndic: syndic ? this.participantDisplayName(syndic) : '—',
      subSyndic: sub ? this.participantDisplayName(sub) : '—',
      administrators,
    };
  }

  private async loadUnitColumns(condominiumId: string): Promise<UnitCol[]> {
    const units = await this.unitRepo.find({
      where: { grouping: { condominiumId } },
      relations: {
        grouping: true,
        responsibleLinks: { person: true },
        financialResponsiblePerson: true,
      },
    });
    units.sort((a, b) => {
      const ga = a.grouping?.name ?? '';
      const gb = b.grouping?.name ?? '';
      const c = ga.localeCompare(gb, 'pt');
      if (c !== 0) {
        return c;
      }
      return a.identifier.localeCompare(b.identifier, 'pt');
    });
    return units.map((u) => {
      const responsibleName = resolveUnitFinancialResponsibleDisplayName({
        financialResponsiblePerson: u.financialResponsiblePerson ?? null,
        responsibleLinks: u.responsibleLinks ?? null,
        responsibleDisplayName: u.responsibleDisplayName ?? null,
      });
      return {
        unitId: u.id,
        identifier: u.identifier,
        groupingName: u.grouping?.name ?? '',
        groupingId: u.groupingId,
        responsibleName,
      };
    });
  }

  /**
   * Quebra texto por largura (PDFKit) sem usar `text({width})`, para não disparar
   * `continueOnNewPage()` interno do LineWrapper (gerava páginas vazias).
   */
  private wrapWordsToLines(
    doc: InstanceType<typeof PDFDocument>,
    text: string,
    maxWidth: number,
  ): string[] {
    const lines: string[] = [];
    const words = String(text).split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (doc.widthOfString(trial) <= maxWidth) {
        cur = trial;
      } else {
        if (cur) {
          lines.push(cur);
        }
        if (doc.widthOfString(w) <= maxWidth) {
          cur = w;
        } else {
          let rest = w;
          while (rest.length > 0) {
            let i = rest.length;
            while (i > 1 && doc.widthOfString(rest.slice(0, i)) > maxWidth) {
              i--;
            }
            lines.push(rest.slice(0, i));
            rest = rest.slice(i);
          }
          cur = '';
        }
      }
    }
    if (cur) {
      lines.push(cur);
    }
    return lines;
  }

  private drawTextLines(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc: any,
    x: number,
    y: number,
    lines: string[],
    lineHeight: number,
    margin: number,
  ): number {
    let cy = y;
    for (const line of lines) {
      cy = this.ensureSpace(doc, cy, lineHeight, margin);
      doc.text(line, x, cy, { lineBreak: false });
      cy += lineHeight;
    }
    return cy;
  }

  /** Dirigentes no planejamento (antes de «Agrupamentos»). */
  private renderAdministracaoSection(
    doc: InstanceType<typeof PDFDocument>,
    adm: AdministracaoPdf,
    margin: number,
    contentW: number,
    yStart: number,
  ): number {
    let y = yStart;
    y = this.ensureSpace(doc, y, 36, margin);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#121820');
    doc.text('Administração', margin, y, { lineBreak: false });
    y += 14;
    doc.font('Helvetica').fontSize(8.5).fillColor('#1e293b');
    const intro =
      'Síndico, subsíndico e administradores reconhecidos no planejamento (cadastro atual).';
    const introLines = this.wrapWordsToLines(doc, intro, contentW);
    const ilh = doc.currentLineHeight(true) + 2;
    y = this.drawTextLines(doc, margin, y, introLines, ilh, margin);
    y += 6;
    doc.font('Helvetica').fontSize(8.5).fillColor('#111827');
    doc.text(`Síndico: ${adm.syndic}`, margin, y, { lineBreak: false });
    y += ilh;
    doc.text(`Subsíndico: ${adm.subSyndic}`, margin, y, { lineBreak: false });
    y += ilh;
    const admText =
      adm.administrators.length === 0
        ? 'Administradores: —'
        : `Administradores: ${adm.administrators.join(', ')}`;
    const admLines = this.wrapWordsToLines(doc, admText, contentW);
    y = this.drawTextLines(doc, margin, y, admLines, ilh, margin);
    doc.fillColor('#111827');
    return y + 6;
  }

  /**
   * Folha dedicada: administração e agrupamentos (separada do extrato financeiro).
   */
  private renderCondominioCadastroDedicatedPage(
    doc: InstanceType<typeof PDFDocument>,
    margin: number,
    contentW: number,
    administracao: AdministracaoPdf,
    agrupamentosRows: AgrupamentosPdfRow[],
  ): number {
    doc.addPage();
    doc.x = margin;
    doc.y = margin;
    let y = margin;
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#121820');
    doc.text('Administração e agrupamentos', margin, y, { lineBreak: false });
    y += 20;
    doc.font('Helvetica').fontSize(9).fillColor('#5a6572');
    const pageIntro =
      'Dados cadastrais do condomínio: dirigentes no planejamento e unidades por agrupamento (configuração atual no sistema).';
    const pageIntroLines = this.wrapWordsToLines(doc, pageIntro, contentW);
    const pilh = doc.currentLineHeight(true) + 2.5;
    y = this.drawTextLines(doc, margin, y, pageIntroLines, pilh, margin);
    y += 14;
    doc.fillColor('#111827');
    y = this.renderAdministracaoSection(
      doc,
      administracao,
      margin,
      contentW,
      y,
    );
    y = this.renderAgrupamentosConfiguredSection(
      doc,
      agrupamentosRows,
      margin,
      contentW,
      y,
    );
    return y + 8;
  }

  /**
   * Agrupamentos configurados: cada tipo com lista de unidades e responsável
   * (antes da seção «Fundos e agrupamentos no rateio»).
   */
  private renderAgrupamentosConfiguredSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: AgrupamentosPdfRow[],
    margin: number,
    contentW: number,
    yStart: number,
  ): number {
    let y = yStart;
    y = this.ensureSpace(doc, y, 40, margin);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#121820');
    doc.text('Agrupamentos', margin, y, { lineBreak: false });
    y += 15;
    doc.font('Helvetica').fontSize(8.5).fillColor('#1e293b');
    const intro =
      'Unidades do condomínio por agrupamento e responsável cadastrado (configuração atual).';
    const introLines = this.wrapWordsToLines(doc, intro, contentW);
    const ilh = doc.currentLineHeight(true) + 2;
    y = this.drawTextLines(doc, margin, y, introLines, ilh, margin);
    y += 8;
    doc.fillColor('#111827');

    if (rows.length === 0) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#64748b');
      doc.text('Nenhum agrupamento cadastrado.', margin, y, {
        lineBreak: false,
      });
      return y + 14;
    }

    const gapAfterBlock = 8;
    const innerW = contentW - 22;
    const inset = 10;
    for (const block of rows) {
      doc.font('Helvetica-Bold').fontSize(9.5);
      const titleLh = doc.currentLineHeight(true) + 2;
      doc.font('Helvetica').fontSize(8.5);
      const bodyLh = doc.currentLineHeight(true) + 1.5;

      const bodyChunks: string[] = [];
      if (block.unitLines.length === 0) {
        bodyChunks.push('Nenhuma unidade neste agrupamento.');
      } else {
        for (const line of block.unitLines) {
          bodyChunks.push(...this.wrapWordsToLines(doc, line, innerW));
        }
      }

      const padTop = 6;
      const padBottom = 6;
      const boxH =
        padTop + titleLh + 3 + bodyChunks.length * bodyLh + padBottom;

      y = this.ensureSpace(doc, y, boxH + gapAfterBlock, margin);
      const boxY = y;

      doc.save();
      doc
        .roundedRect(margin, boxY, contentW, boxH, 4)
        .fill('#f6f8fb')
        .strokeColor('#d8e0ea')
        .lineWidth(0.4)
        .stroke();
      doc.restore();

      let cy = boxY + padTop;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1a1a1a');
      doc.text(block.groupingName, margin + inset, cy, { lineBreak: false });
      cy += titleLh + 1;
      doc.font('Helvetica').fontSize(8.5).fillColor('#1e293b');
      for (const wl of bodyChunks) {
        doc.fillColor('#1e293b');
        doc.text(wl, margin + inset, cy, { lineBreak: false });
        cy += bodyLh;
      }

      y = boxY + boxH + gapAfterBlock;
    }
    return y + 2;
  }

  /** Bloco inicial: cada fundo com texto de quais agrupamentos/unidades entram no rateio. */
  private renderFundsAgrupamentosSection(
    doc: InstanceType<typeof PDFDocument>,
    fundRows: FundPdfRow[],
    margin: number,
    contentW: number,
    yStart: number,
  ): number {
    let y = yStart;
    y = this.ensureSpace(doc, y, 40, margin);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#121820');
    doc.text('Fundos e agrupamentos no rateio', margin, y, {
      lineBreak: false,
    });
    y += 15;
    doc.font('Helvetica').fontSize(8.5).fillColor('#5a6572');
    const intro =
      'Cada fundo indica quais agrupamentos e/ou unidades participam do respectivo rateio (configuração atual no sistema).';
    const introLines = this.wrapWordsToLines(doc, intro, contentW);
    const ilh = doc.currentLineHeight(true) + 2;
    y = this.drawTextLines(doc, margin, y, introLines, ilh, margin);
    y += 8;

    if (fundRows.length === 0) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#888888');
      doc.text('Nenhum fundo cadastrado.', margin, y, { lineBreak: false });
      return y + 14;
    }

    const gapAfterCard = 8;
    const inset = 10;
    const textW = contentW - inset * 2;
    for (const f of fundRows) {
      doc.font('Helvetica-Bold').fontSize(9.5);
      const nameLines = this.wrapWordsToLines(
        doc,
        f.name.trim() || '—',
        textW,
      );
      const lineHName = doc.currentLineHeight(true) + 1;
      doc.font('Helvetica').fontSize(8.5);
      const sumLines = this.wrapWordsToLines(
        doc,
        f.allocationSummary,
        textW,
      );
      const lineHSum = doc.currentLineHeight(true) + 1.5;
      const blockNeed =
        12 +
        nameLines.length * lineHName +
        sumLines.length * lineHSum +
        gapAfterCard;
      y = this.ensureSpace(doc, y, blockNeed, margin);

      const boxH =
        10 + nameLines.length * lineHName + sumLines.length * lineHSum;
      doc.save();
      doc
        .roundedRect(margin, y - 2, contentW, boxH, 4)
        .fill('#f6f8fb')
        .strokeColor('#d8e0ea')
        .lineWidth(0.4)
        .stroke();
      doc.restore();

      let cy = y + 6;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1a1a1a');
      for (const nl of nameLines) {
        doc.text(nl, margin + inset, cy, { lineBreak: false });
        cy += lineHName;
      }
      doc.font('Helvetica').fontSize(8.5).fillColor('#3d4a57');
      for (const sl of sumLines) {
        doc.text(sl, margin + inset, cy, { lineBreak: false });
        cy += lineHSum;
      }
      y = cy + gapAfterCard;
    }
    return y + 2;
  }

  /** Extrato por fundo: saldo anterior, movimentos do mês e saldo final. */
  private renderFundBalancesTable(
    doc: InstanceType<typeof PDFDocument>,
    rows: FundExtratoPdfRow[],
    competenceYmPtBr: string,
    openingYmd: string,
    closingYmd: string,
    margin: number,
    contentW: number,
    yStart: number,
  ): number {
    const accent = '#1a3a52';
    const colGap = 5;
    const colNumW = 68;
    const colCount = 4;
    const colFundW =
      contentW - colNumW * colCount - colGap * (colCount + 1);
    const colOpenX = margin + colFundW + colGap;
    const colIncX = colOpenX + colNumW + colGap;
    const colExpX = colIncX + colNumW + colGap;
    const colCloseX = colExpX + colNumW + colGap;

    const drawAmtRight = (
      text: string,
      colX: number,
      yy: number,
      fontSize = 8.5,
    ): void => {
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#0d1b26');
      doc.text(text, colX + colNumW - 4 - doc.widthOfString(text), yy, {
        lineBreak: false,
      });
    };

    let y = yStart;
    y = this.ensureSpace(doc, y, 80, margin);

    doc.font('Helvetica-Bold').fontSize(15).fillColor('#121820');
    doc.text(`Extrato dos fundos — ${competenceYmPtBr}`, margin, y, {
      lineBreak: false,
    });
    y += 22;
    doc.font('Helvetica').fontSize(8.5).fillColor('#5a6572');
    const openPt = this.formatYmdPtBr(openingYmd);
    const closePt = this.formatYmdPtBr(closingYmd);
    const sub =
      `Saldo anterior em ${openPt} (fim do mês anterior à competência). ` +
      `Receitas e despesas/aplicações são os lançamentos do mês ${competenceYmPtBr} (igual ao extrato mensal do painel). ` +
      `Saldo final em ${closePt}: saldo anterior + receitas - despesas do mês.`;
    const subLines = this.wrapWordsToLines(doc, sub, contentW);
    const slh = doc.currentLineHeight(true) + 3;
    y = this.drawTextLines(doc, margin, y, subLines, slh, margin);
    y += 12;

    if (rows.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#888888');
      doc.text('Nenhum fundo cadastrado.', margin, y, { lineBreak: false });
      return y + 24;
    }

    const headH = 40;
    y = this.ensureSpace(doc, y, headH + 6, margin);
    doc.save();
    doc
      .rect(margin, y, contentW, headH)
      .fill('#e8edf4')
      .strokeColor('#b8c4d4')
      .lineWidth(0.55)
      .stroke();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(accent);
    doc.text('Fundo', margin + 8, y + 14, { lineBreak: false });
    const hOpen = 'Saldo ant.';
    drawAmtRight(hOpen, colOpenX, y + 6, 8);
    const hInc = '(+) Receitas';
    drawAmtRight(hInc, colIncX, y + 6, 8);
    const hExp = '(-) Despesas';
    drawAmtRight(hExp, colExpX, y + 6, 8);
    const hClose = 'Saldo final';
    drawAmtRight(hClose, colCloseX, y + 6, 8);
    doc.font('Helvetica').fontSize(6.5).fillColor('#5a6572');
    doc.text('mês', colIncX + colNumW - 4 - doc.widthOfString('mês'), y + 22, {
      lineBreak: false,
    });
    doc.text('mês', colExpX + colNumW - 4 - doc.widthOfString('mês'), y + 22, {
      lineBreak: false,
    });
    y += headH;

    let idx = 0;
    let totOpen = 0n;
    let totInc = 0n;
    let totExp = 0n;
    let totClose = 0n;

    for (const f of rows) {
      const o = f.openingCents;
      const c = f.closingCents;
      totOpen += o;
      totInc += f.incomeCents;
      totExp += f.expenseCents;
      totClose += c;

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#222222');
      const nameLines = this.wrapWordsToLines(
        doc,
        f.name.trim() || '—',
        colFundW - 14,
      );
      const nameLh = doc.currentLineHeight(true) + 1.5;
      const rowH = Math.max(32, 12 + nameLines.length * nameLh);

      y = this.ensureSpace(doc, y, rowH + 4, margin);
      if (idx % 2 === 1) {
        doc.save();
        doc.rect(margin, y, contentW, rowH).fill('#f5f7fa');
        doc.restore();
      }
      doc.save();
      doc.strokeColor('#e8ecf0').lineWidth(0.35);
      doc.moveTo(margin, y + rowH).lineTo(margin + contentW, y + rowH).stroke();
      doc.restore();

      let ty = y + 10;
      for (const nl of nameLines) {
        doc.text(nl, margin + 8, ty, { lineBreak: false });
        ty += nameLh;
      }
      const amtY = y + Math.max(8, (rowH - 14) / 2);
      drawAmtRight(this.brlSigned(o), colOpenX, amtY);
      drawAmtRight(this.brl(f.incomeCents), colIncX, amtY);
      drawAmtRight(this.brl(f.expenseCents), colExpX, amtY);
      drawAmtRight(this.brlSigned(c), colCloseX, amtY);
      y += rowH;
      idx += 1;
    }

    const totH = 34;
    y = this.ensureSpace(doc, y, totH + 4, margin);
    doc.save();
    doc
      .rect(margin, y, contentW, totH)
      .fill('#eef2f7')
      .strokeColor('#b8c4d4')
      .lineWidth(0.45)
      .stroke();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(accent);
    doc.text('Total', margin + 8, y + 12, { lineBreak: false });
    const totY = y + 10;
    drawAmtRight(this.brlSigned(totOpen), colOpenX, totY);
    drawAmtRight(this.brl(totInc), colIncX, totY);
    drawAmtRight(this.brl(totExp), colExpX, totY);
    drawAmtRight(this.brlSigned(totClose), colCloseX, totY);
    y += totH;

    return y + 12;
  }

  /**
   * Extrato por conta bancária cadastrada (saldo anterior, entradas/saídas do mês, saldo final).
   */
  private renderBankAccountsExtratoTable(
    doc: InstanceType<typeof PDFDocument>,
    accounts: BankAccountPdfRow[],
    generalCash: GeneralCashPdfSummary,
    competenceYmPtBr: string,
    margin: number,
    contentW: number,
    yStart: number,
  ): number {
    const accent = '#1a3a52';
    const colGap = 5;
    const colNumW = 68;
    const colCount = 4;
    const colNameW =
      contentW - colNumW * colCount - colGap * (colCount + 1);
    const colOpenX = margin + colNameW + colGap;
    const colIncX = colOpenX + colNumW + colGap;
    const colOutX = colIncX + colNumW + colGap;
    const colCloseX = colOutX + colNumW + colGap;

    const drawAmtRight = (
      text: string,
      colX: number,
      yy: number,
      fontSize = 8.5,
    ): void => {
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#0d1b26');
      doc.text(text, colX + colNumW - 4 - doc.widthOfString(text), yy, {
        lineBreak: false,
      });
    };

    let y = yStart;
    y = this.ensureSpace(doc, y, 80, margin);

    doc.font('Helvetica-Bold').fontSize(15).fillColor('#121820');
    doc.text(`Extrato das contas bancárias — ${competenceYmPtBr}`, margin, y, {
      lineBreak: false,
    });
    y += 22;
    doc.font('Helvetica').fontSize(8.5).fillColor('#5a6572');
    const openPt = this.formatYmdPtBr(generalCash.openingYmd);
    const closePt = this.formatYmdPtBr(generalCash.closingYmd);
    const sub =
      `Saldo anterior em ${openPt} por conta cadastrada no sistema. ` +
      `Entradas e saídas do mês ${competenceYmPtBr} incluem lançamentos financeiros e quitações de taxa sem receita vinculada na mesma conta. ` +
      `Saldo final em ${closePt}.`;
    const subLines = this.wrapWordsToLines(doc, sub, contentW);
    const slh = doc.currentLineHeight(true) + 3;
    y = this.drawTextLines(doc, margin, y, subLines, slh, margin);
    y += 12;

    if (accounts.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#888888');
      doc.text(
        'Nenhuma conta bancária ativa cadastrada. Cadastre as contas no painel para que os saldos apareçam neste relatório.',
        margin,
        y,
        { lineBreak: false, width: contentW },
      );
      y += 28;
    } else {
      const headH = 40;
      y = this.ensureSpace(doc, y, headH + 6, margin);
      doc.save();
      doc
        .rect(margin, y, contentW, headH)
        .fill('#e8edf4')
        .strokeColor('#b8c4d4')
        .lineWidth(0.55)
        .stroke();
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(accent);
      doc.text('Conta', margin + 8, y + 14, { lineBreak: false });
      drawAmtRight('Saldo ant.', colOpenX, y + 6, 8);
      drawAmtRight('(+) Entradas', colIncX, y + 6, 8);
      drawAmtRight('(-) Saídas', colOutX, y + 6, 8);
      drawAmtRight('Saldo final', colCloseX, y + 6, 8);
      doc.font('Helvetica').fontSize(6.5).fillColor('#5a6572');
      doc.text('mês', colIncX + colNumW - 4 - doc.widthOfString('mês'), y + 22, {
        lineBreak: false,
      });
      doc.text('mês', colOutX + colNumW - 4 - doc.widthOfString('mês'), y + 22, {
        lineBreak: false,
      });
      y += headH;

      let idx = 0;
      let totOpen = 0n;
      let totInc = 0n;
      let totOut = 0n;
      let totClose = 0n;

      for (const acc of accounts) {
        totOpen += acc.openingCents;
        totInc += acc.incomeCents;
        totOut += acc.outflowCents;
        totClose += acc.closingCents;

        const label =
          acc.bankLabel != null && acc.bankLabel.length > 0
            ? `${acc.name} — ${acc.bankLabel}`
            : acc.name;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#222222');
        const nameLines = this.wrapWordsToLines(doc, label, colNameW - 14);
        const nameLh = doc.currentLineHeight(true) + 1.5;
        const rowH = Math.max(32, 12 + nameLines.length * nameLh);

        y = this.ensureSpace(doc, y, rowH + 4, margin);
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(margin, y, contentW, rowH).fill('#f5f7fa');
          doc.restore();
        }
        doc.save();
        doc.strokeColor('#e8ecf0').lineWidth(0.35);
        doc
          .moveTo(margin, y + rowH)
          .lineTo(margin + contentW, y + rowH)
          .stroke();
        doc.restore();

        let ty = y + 10;
        for (const nl of nameLines) {
          doc.text(nl, margin + 8, ty, { lineBreak: false });
          ty += nameLh;
        }
        const amtY = y + Math.max(10, (rowH - 12) / 2);
        drawAmtRight(this.brlSigned(acc.openingCents), colOpenX, amtY);
        drawAmtRight(this.brl(acc.incomeCents), colIncX, amtY);
        drawAmtRight(this.brl(acc.outflowCents), colOutX, amtY);
        drawAmtRight(this.brlSigned(acc.closingCents), colCloseX, amtY);
        y += rowH;
        idx += 1;
      }

      const totH = 34;
      y = this.ensureSpace(doc, y, totH + 4, margin);
      doc.save();
      doc
        .rect(margin, y, contentW, totH)
        .fill('#dce6f2')
        .strokeColor('#b8c4d4')
        .lineWidth(0.55)
        .stroke();
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(accent);
      doc.text('Total (contas ativas)', margin + 8, y + 12, { lineBreak: false });
      const totY = y + 10;
      drawAmtRight(this.brlSigned(totOpen), colOpenX, totY);
      drawAmtRight(this.brl(totInc), colIncX, totY);
      drawAmtRight(this.brl(totOut), colOutX, totY);
      drawAmtRight(this.brlSigned(totClose), colCloseX, totY);
      y += totH;
    }

    y += 16;
    y = this.renderGeneralCashConsolidatedBox(
      doc,
      generalCash,
      competenceYmPtBr,
      margin,
      contentW,
      y,
    );
    return y + 8;
  }

  /** Resumo da conta geral (soma de todas as contas bancárias ativas). */
  private renderGeneralCashConsolidatedBox(
    doc: InstanceType<typeof PDFDocument>,
    generalCash: GeneralCashPdfSummary,
    competenceYmPtBr: string,
    margin: number,
    contentW: number,
    yStart: number,
  ): number {
    const accent = '#1a3a52';
    let y = yStart;
    y = this.ensureSpace(doc, y, 100, margin);

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#121820');
    doc.text(`Conta geral do condomínio — ${competenceYmPtBr}`, margin, y, {
      lineBreak: false,
    });
    y += 20;
    doc.font('Helvetica').fontSize(8.5).fillColor('#5a6572');
    const intro =
      'Consolidado de todas as contas bancárias ativas (equivalente ao extrato «Conta geral» no painel). ' +
      'Reflete o caixa real do condomínio, incluindo movimentos sem fundo específico e taxas quitadas.';
    const introLines = this.wrapWordsToLines(doc, intro, contentW);
    const ilh = doc.currentLineHeight(true) + 2.5;
    y = this.drawTextLines(doc, margin, y, introLines, ilh, margin);
    y += 10;

    const openPt = this.formatYmdPtBr(generalCash.openingYmd);
    const closePt = this.formatYmdPtBr(generalCash.closingYmd);
    const boxH = 72;
    y = this.ensureSpace(doc, y, boxH + 8, margin);
    doc.save();
    doc
      .roundedRect(margin, y, contentW, boxH, 4)
      .fill('#f8fafc')
      .strokeColor('#cbd5e1')
      .lineWidth(0.5)
      .stroke();
    doc.restore();

    const iy = y + 12;
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748b');
    doc.text(`Saldo em ${openPt}`, margin + 12, iy, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(accent);
    doc.text(this.brlSigned(generalCash.openingCents), margin + 12, iy + 14, {
      lineBreak: false,
    });

    const midX = margin + contentW / 2;
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748b');
    doc.text(`Saldo em ${closePt}`, midX, iy, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(accent);
    doc.text(this.brlSigned(generalCash.closingCents), midX, iy + 14, {
      lineBreak: false,
    });

    y += boxH + 10;
    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    const detail =
      `Composição do saldo anterior: saldo inicial cadastrado nas contas (${this.brlSigned(generalCash.bankSeedCents)}) ` +
      `+ movimentos e quitações até ${openPt} (${this.brlSigned(generalCash.movementsOpeningCents)}).`;
    const detailLines = this.wrapWordsToLines(doc, detail, contentW);
    y = this.drawTextLines(doc, margin, y, detailLines, ilh, margin);
    doc.fillColor('#000000');
    return y + 6;
  }

  private formatYmdPtBr(ymd: string): string {
    const head = ymd.trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
    if (!m) {
      return head;
    }
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  /** Ex.: `2026-03` → `Março/2026` */
  private formatCompetenceYmPtBr(ym: string): string {
    const head = ym.trim();
    const m = /^(\d{4})-(\d{2})$/.exec(head);
    if (!m) {
      return head;
    }
    const year = m[1];
    const monthNum = Number.parseInt(m[2], 10);
    const monthNames = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];
    const label = monthNames[monthNum - 1];
    if (!label) {
      return head;
    }
    return `${label}/${year}`;
  }

  /** Ex.: limites da competência em `dd/mm/aaaa à dd/mm/aaaa`. */
  private formatExpensePeriodLabelPtBr(fromYmd: string, toYmd: string): string {
    return `${this.formatYmdPtBr(fromYmd)} à ${this.formatYmdPtBr(toYmd)}`;
  }

  /** Substitui `(AAAA-MM)` nos títulos (ex. mensalidades de fundo) por `(Mês/AAAA)`. */
  private displayTransactionTitleForPdf(title: string): string {
    return String(title).replace(
      /\((\d{4})-(0[1-9]|1[0-2])\)/g,
      (_, y: string, mo: string) =>
        `(${this.formatCompetenceYmPtBr(`${y}-${mo}`)})`,
    );
  }

  private feeChargeStatusLabelPt(status: string): string {
    return status === 'paid' ? 'Quitada' : 'Em aberto';
  }

  /**
   * Quando o PDF é pedido no contexto de uma unidade: explica o documento e lista a taxa de
   * todas as unidades, com destaque para a unidade do condômino.
   */
  private renderSlipFollowFeeContextSection(
    doc: InstanceType<typeof PDFDocument>,
    p: {
      margin: number;
      contentW: number;
      yStart: number;
      competenceYmPtBr: string;
      targetUnitIdentifier: string;
      unitCols: UnitCol[];
      charges: CondominiumFeeCharge[];
      highlightUnitId: string;
    },
  ): number {
    const { margin, contentW } = p;
    let y = p.yStart;
    const boxPad = 10;
    const explain =
      `Prestação de contas mensal do condomínio (competência ${p.competenceYmPtBr}): extrato financeiro do período (conta geral e fundos) e, ao final, extrato de despesas e taxa por agrupamento — unidades com valor diferente do padrão do agrupamento aparecem em bloco próprio. ` +
      `Na tabela abaixo consta o valor da taxa condominial desta competência para cada unidade (a linha sombreada corresponde à unidade ${p.targetUnitIdentifier}).`;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0c4a6e');
    const titleLh = doc.currentLineHeight(true) + 2.5;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    const exLines = this.wrapWordsToLines(doc, explain, contentW - boxPad * 2);
    const exLh = doc.currentLineHeight(true) + 2.5;
    const boxH = boxPad * 2 + titleLh + 2 + exLines.length * exLh + 8;
    y = this.ensureSpace(doc, y, boxH + 16, margin);
    doc.save();
    doc
      .roundedRect(margin, y, contentW, boxH, 5)
      .fill('#f0f9ff')
      .stroke('#bae6fd')
      .lineWidth(0.55)
      .stroke();
    doc.restore();
    let cy = y + boxPad;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0c4a6e');
    doc.text('Sobre este documento', margin + boxPad, cy, { lineBreak: false });
    cy += titleLh + 2;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    for (const ln of exLines) {
      doc.text(ln, margin + boxPad, cy, { lineBreak: false });
      cy += exLh;
    }
    y = y + boxH + 18;

    y = this.ensureSpace(doc, y, 52, margin);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a');
    doc.text(
      `Taxa condominial — valores por unidade (${p.competenceYmPtBr})`,
      margin,
      y,
      { lineBreak: false },
    );
    y += 20;
    doc.font('Helvetica').fontSize(8.8).fillColor('#64748b');
    const sub = this.wrapWordsToLines(
      doc,
      'Valores devidos nesta competência, conforme cobranças geradas no sistema. A linha sombreada destaca a sua unidade.',
      contentW,
    );
    const subLh = doc.currentLineHeight(true) + 2;
    y = this.drawTextLines(doc, margin, y, sub, subLh, margin);
    y += 10;

    const wUnit = 52;
    const wDue = 54;
    const wAmt = 80;
    const wStat = 56;
    const wGrp = Math.max(72, contentW - wUnit - wDue - wAmt - wStat);
    const xUnit = margin;
    const xGrp = xUnit + wUnit;
    const xDue = xGrp + wGrp;
    const xAmt = xDue + wDue;
    const xStat = xAmt + wAmt;

    const headH = 22;
    y = this.ensureSpace(doc, y, headH + 8, margin);
    doc.save();
    doc
      .rect(xUnit, y, wUnit + wGrp + wDue + wAmt + wStat, headH)
      .fill('#e2e8f0')
      .stroke('#94a3b8');
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(7.8).fillColor('#1e293b');
    doc.text('Unidade', xUnit + 4, y + 7, { lineBreak: false });
    doc.text('Agrupamento', xGrp + 4, y + 7, { lineBreak: false });
    const hVenc = 'Venc.';
    doc.text(hVenc, xDue + wDue - 4 - doc.widthOfString(hVenc), y + 7, {
      lineBreak: false,
    });
    const hVal = 'Valor';
    doc.text(hVal, xAmt + wAmt - 4 - doc.widthOfString(hVal), y + 7, {
      lineBreak: false,
    });
    const hSit = 'Situação';
    doc.text(hSit, xStat + wStat - 4 - doc.widthOfString(hSit), y + 7, {
      lineBreak: false,
    });
    y += headH;

    const chargeByUnit = new Map<string, CondominiumFeeCharge>();
    for (const c of p.charges) {
      chargeByUnit.set(c.unitId, c);
    }
    const sorted = [...p.unitCols].sort((a, b) =>
      a.identifier.localeCompare(b.identifier, 'pt', { sensitivity: 'base' }),
    );
    let sumCents = 0n;
    for (const u of sorted) {
      const ch = chargeByUnit.get(u.unitId);
      if (ch) {
        sumCents += BigInt(String(ch.amountDueCents));
      }
      const grp = (u.groupingName?.trim() || '—').slice(0, 48);
      const dueStr = ch ? this.formatDateBr(ch.dueOn) : '—';
      const amtStr = ch ? this.brl(BigInt(String(ch.amountDueCents))) : '—';
      const statStr = ch ? this.feeChargeStatusLabelPt(ch.status) : 'Sem cobrança';
      const highlight = u.unitId === p.highlightUnitId;
      doc.font('Helvetica').fontSize(7.8);
      const grpLines = this.wrapWordsToLines(doc, grp, wGrp - 8);
      const lh = doc.currentLineHeight(true) + 1;
      const rowH = Math.max(22, 6 + grpLines.length * lh);

      y = this.ensureSpace(doc, y, rowH + 2, margin);
      if (highlight) {
        doc.save();
        doc
          .rect(xUnit, y, wUnit + wGrp + wDue + wAmt + wStat, rowH)
          .fill('#eff6ff');
        doc.restore();
      }
      doc.save();
      doc.strokeColor('#e2e8f0').lineWidth(0.35);
      doc
        .rect(xUnit, y, wUnit, rowH)
        .stroke()
        .rect(xGrp, y, wGrp, rowH)
        .stroke()
        .rect(xDue, y, wDue, rowH)
        .stroke()
        .rect(xAmt, y, wAmt, rowH)
        .stroke()
        .rect(xStat, y, wStat, rowH)
        .stroke();
      doc.restore();

      doc.fillColor('#0f172a');
      doc.font('Helvetica-Bold').fontSize(8);
      const uid = (u.identifier?.trim() || '—').slice(0, 14);
      doc.text(uid, xUnit + 4, y + 6, { lineBreak: false });
      doc.font('Helvetica').fontSize(7.8);
      let gy = y + 5;
      for (const gl of grpLines) {
        doc.text(gl, xGrp + 4, gy, { lineBreak: false });
        gy += lh;
      }
      doc.text(dueStr, xDue + wDue - 4 - doc.widthOfString(dueStr), y + 6, {
        lineBreak: false,
      });
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text(amtStr, xAmt + wAmt - 4 - doc.widthOfString(amtStr), y + 6, {
        lineBreak: false,
      });
      doc.font('Helvetica').fontSize(7.8);
      doc.text(statStr, xStat + wStat - 4 - doc.widthOfString(statStr), y + 6, {
        lineBreak: false,
      });
      y += rowH;
    }

    const totH = 22;
    y = this.ensureSpace(doc, y, totH + 6, margin);
    doc.save();
    doc
      .rect(xUnit, y, wUnit + wGrp + wDue + wAmt + wStat, totH)
      .fill('#f1f5f9')
      .stroke('#94a3b8');
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a');
    doc.text('Total do condomínio', xUnit + 4, y + 6, { lineBreak: false });
    const totS = this.brl(sumCents);
    doc.text(totS, xAmt + wAmt - 4 - doc.widthOfString(totS), y + 6, {
      lineBreak: false,
    });
    y += totH + 14;
    return y;
  }

  /** Parte o payload BR Code em linhas de largura fixa (Courier no PDF). */
  private splitPixPayloadLines(payload: string, maxChars: number): string[] {
    const lines: string[] = [];
    const step = Math.max(16, maxChars);
    for (let i = 0; i < payload.length; i += step) {
      lines.push(payload.slice(i, i + step));
    }
    return lines.length > 0 ? lines : [''];
  }

  /**
   * Mensagem curta (BR Code) a partir de uma ou mais cobranças em aberto.
   */
  private buildPixMessageForOpenCharges(
    charges: CondominiumFeeCharge[],
    condoName: string,
  ): string | undefined {
    if (charges.length === 0) {
      return undefined;
    }
    if (charges.length === 1) {
      const c = charges[0]!;
      const parts = c.competenceYm.split('-');
      const yy = parts[0] ?? '';
      const mo = parts[1] ?? '';
      return (
        sanitizePixMessage(`${condoName} ${mo}/${yy}`, 25) ||
        sanitizePixName(condoName, 25) ||
        undefined
      );
    }
    return (
      sanitizePixMessage(`${condoName} ${charges.length} taxas`, 25) ||
      sanitizePixName(condoName, 25) ||
      undefined
    );
  }

  /**
   * Capa do PDF por unidade: valor a pagar, dados do PIX e (opcionalmente) QR Code + «Copia e cola».
   * Quando há mais de uma taxa em aberto, a soma e a tabela deixam o consolidado claro.
   */
  private renderUnitPixPaymentSlipCoverPage(
    doc: InstanceType<typeof PDFDocument>,
    p: {
      margin: number;
      contentW: number;
      condoName: string;
      unitIdentifier: string;
      groupingName: string;
      responsibleName: string | null;
      competenceBlockTitle: string;
      competenceBlockSubtitle: string | null;
      dueOnBr: string;
      statusLabel: string;
      totalAmountBrl: string;
      referenceLine: string;
      showOpenChargesBreakdown: boolean;
      openChargeRows: { competencia: string; vencimento: string; valor: string }[];
      /** Subtítulo sob o título (ex.: explicar quitação total) */
      hintLine: string | null;
      pixKeyDisplay: string;
      beneficiaryDisplay: string;
      pixBrPayload: string | null;
      pixQrPng: Buffer | null;
      showBrCopyPaste: boolean;
      syndicWhatsapp: string | null;
    },
  ): void {
    const accent = '#1a3a52';
    const muted = '#5a6572';
    const { margin, contentW } = p;
    let y = margin;

    doc.save();
    doc.rect(margin, y, 4, 50).fill(accent);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#121820');
    doc.text('Pagamento da taxa condominial', margin + 12, y + 2, {
      lineBreak: false,
    });
    const hint = p.hintLine ?? 'Slip de pagamento via PIX — específico para a unidade';
    doc.font('Helvetica').fontSize(9.2).fillColor(muted);
    const hintW = contentW - 20;
    const hintLines = this.wrapWordsToLines(doc, hint, hintW);
    let hy = y + 30;
    const hLh = doc.currentLineHeight(true) + 1.1;
    for (const hl of hintLines) {
      doc.text(hl, margin + 12, hy, { width: hintW, lineBreak: false });
      hy += hLh;
    }
    y = hy + 8;

    const infoPad = 10;
    const half = (contentW - 14) / 2;
    const infoH =
      p.competenceBlockSubtitle != null || p.showOpenChargesBreakdown
        ? 100
        : 82;
    doc.save();
    doc.roundedRect(margin, y, contentW, infoH, 4).fill('#f1f5f9');
    doc.restore();

    const iy = y + infoPad;
    doc.font('Helvetica').fontSize(7.5).fillColor(muted);
    doc.text('CONDOMÍNIO', margin + infoPad, iy, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
    doc.text(p.condoName.slice(0, 44), margin + infoPad, iy + 12, {
      lineBreak: false,
    });
    doc.font('Helvetica').fontSize(7.5).fillColor(muted);
    doc.text('UNIDADE', margin + infoPad, iy + 28, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
    const unitLine = `${p.unitIdentifier} · ${p.groupingName}`.slice(0, 48);
    doc.text(unitLine, margin + infoPad, iy + 40, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(muted);
    doc.text('Responsável', margin + infoPad, iy + 56, { lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    doc.text(
      (p.responsibleName || '—').slice(0, 52),
      margin + infoPad,
      infoH > 88 ? iy + 68 : iy + 66,
      { lineBreak: false },
    );

    const col2x = margin + half + 6;
    const col2w = contentW - half - infoPad - 10;
    doc.font('Helvetica').fontSize(7.5).fillColor(muted);
    doc.text(
      p.competenceBlockSubtitle != null ? 'COMPETÊNCIAS' : 'COMPETÊNCIA',
      col2x,
      iy,
      { lineBreak: false },
    );
    if (p.competenceBlockSubtitle) {
      doc
        .font('Helvetica-Bold')
        .fontSize(9.2)
        .fillColor('#0f172a');
      doc.text(p.competenceBlockTitle, col2x, iy + 9, {
        width: col2w,
        lineGap: 0.2,
      });
      doc
        .font('Helvetica')
        .fontSize(7.1)
        .fillColor('#475569');
      doc.text(p.competenceBlockSubtitle, col2x, iy + 28, {
        width: col2w,
        lineBreak: true,
        lineGap: 0.2,
      });
      const v0 = iy + 44;
      doc.font('Helvetica').fontSize(7.5).fillColor(muted);
      doc.text('VENCIMENTO', col2x, v0, { lineBreak: false });
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#0f172a');
      doc.text(p.dueOnBr, col2x, v0 + 10, { lineBreak: false, width: col2w });
      doc.font('Helvetica').fontSize(7.5).fillColor(muted);
      doc.text('SITUAÇÃO', col2x, v0 + 28, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#b45309');
      doc.text(p.statusLabel, col2x, v0 + 38, {
        lineBreak: true,
        width: col2w,
      });
    } else {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#0f172a');
      doc.text(p.competenceBlockTitle, col2x, iy + 12, {
        lineBreak: true,
        width: col2w,
      });
      doc.font('Helvetica').fontSize(7.5).fillColor(muted);
      doc.text('VENCIMENTO', col2x, iy + 28, { lineBreak: false });
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#0f172a');
      doc.text(p.dueOnBr, col2x, iy + 40, { lineBreak: false, width: col2w });
      doc.font('Helvetica').fontSize(7.5).fillColor(muted);
      doc.text('SITUAÇÃO', col2x, iy + 56, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#b45309');
      doc.text(p.statusLabel, col2x, iy + 66, {
        lineBreak: true,
        width: col2w,
      });
    }

    y += infoH + 10;

    if (p.showOpenChargesBreakdown && p.openChargeRows.length > 0) {
      doc
        .font('Helvetica-Bold')
        .fontSize(9.2)
        .fillColor('#0f172a');
      doc.text('Detalhamento das taxas em aberto', margin, y, { width: contentW });
      y = doc.y + 6;
      const rowH = 14;
      const col1w = contentW * 0.42;
      const col2m = contentW * 0.26;
      const col3m = contentW * 0.32;
      doc.save();
      doc
        .rect(margin, y, contentW, rowH)
        .fill('#e2e8f0')
        .lineWidth(0.2);
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(7.5);
      doc.text('Competência (taxa)', margin + 3, y + 3, { width: col1w - 6 });
      doc.text('Vencimento', margin + col1w, y + 3, { width: col2m - 4 });
      doc.text('Valor', margin + col1w + col2m, y + 3, {
        width: col3m - 4,
        align: 'right',
      });
      y += rowH;
      for (const row of p.openChargeRows) {
        doc.save();
        doc
          .rect(margin, y, contentW, rowH)
          .stroke('#e2e8f0')
          .lineWidth(0.25);
        doc.restore();
        doc.font('Helvetica').fontSize(7.8);
        doc.text(row.competencia, margin + 3, y + 3, { width: col1w - 6 });
        doc.text(row.vencimento, margin + col1w, y + 3, { width: col2m - 4 });
        doc.font('Helvetica').fontSize(7.8);
        doc.text(row.valor, margin + col1w + col2m, y + 3, {
          width: col3m - 4,
          align: 'right',
        });
        y += rowH;
      }
      y += 8;
    }

    const blkH = 58;
    doc.save();
    doc.roundedRect(margin, y, contentW, blkH, 4).fill('#0f172a');
    doc.restore();
    doc.font('Helvetica').fontSize(8.5).fillColor('#e2e8f0');
    doc.text('VALOR A PAGAR', margin + 12, y + 8, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(21).fillColor('#ffffff');
    doc.text(p.totalAmountBrl, margin + 12, y + 24, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
    doc.text(p.referenceLine.slice(0, 96), margin + 12, y + blkH - 14, {
      width: contentW - 20,
      lineBreak: true,
    });
    y += blkH + 12;

    doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#1d4ed8');
    doc.text('Pague via PIX', margin, y, { lineBreak: false });
    y += 18;

    const qrSize = 124;
    const colTextX = margin + (p.pixQrPng ? qrSize + 14 : 0);
    const textW = p.pixQrPng ? contentW - qrSize - 14 : contentW;
    let ty = y;
    if (p.pixQrPng) {
      doc.image(p.pixQrPng, margin, y, { width: qrSize, height: qrSize });
    }

    doc.font('Helvetica').fontSize(7.5).fillColor(muted);
    doc.text('BENEFICIÁRIO', colTextX, ty, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
    doc.text(p.beneficiaryDisplay.slice(0, 42), colTextX, ty + 11, {
      width: textW,
      lineBreak: false,
    });
    ty += 30;
    doc.font('Helvetica').fontSize(7.5).fillColor(muted);
    doc.text('CHAVE PIX', colTextX, ty, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
    doc.text(p.pixKeyDisplay.slice(0, 56), colTextX, ty + 11, {
      width: textW,
      lineBreak: false,
    });
    ty += 32;
    doc.font('Helvetica').fontSize(7.5).fillColor(muted);
    doc.text('COMO PAGAR', colTextX, ty, { lineBreak: false });
    const comoText =
      p.pixQrPng != null
        ? 'Abra o app do seu banco, escolha PIX e escaneie o QR Code ao lado ou use o código em «PIX Copia e cola» abaixo.'
        : p.showBrCopyPaste && p.pixBrPayload
          ? 'Abra o app do seu banco, escolha PIX e use o código em «PIX Copia e cola» abaixo.'
          : 'Abra o app do seu banco, escolha PIX e informe a chave PIX indicada acima.';
    doc.font('Helvetica').fontSize(8.3).fillColor('#475569');
    const comoLines = this.wrapWordsToLines(doc, comoText, textW);
    let cy = ty + 11;
    const clh = doc.currentLineHeight(true) + 1.5;
    for (const ln of comoLines) {
      doc.text(ln, colTextX, cy, { width: textW, lineBreak: false });
      cy += clh;
    }

    const qrBottom = p.pixQrPng ? y + qrSize : y;
    const textBottom = cy + 4;
    y = Math.max(qrBottom, textBottom) + 8;

    if (p.showBrCopyPaste && p.pixBrPayload) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
      doc.text('PIX Copia e cola', margin, y, { lineBreak: false });
      y += 12;
      const boxPad = 7;
      const approxCharW = 4.1;
      const charsPerLine = Math.max(
        28,
        Math.floor((contentW - boxPad * 2) / approxCharW),
      );
      const brLines = this.splitPixPayloadLines(p.pixBrPayload, charsPerLine);
      const lineH = 8.5;
      const boxH = boxPad * 2 + brLines.length * lineH + 4;
      doc.save();
      doc
        .roundedRect(margin, y, contentW, boxH, 3)
        .fill('#f8fafc')
        .stroke('#e2e8f0')
        .lineWidth(0.4);
      doc.restore();
      doc.font('Courier').fontSize(6.8).fillColor('#1e293b');
      let by = y + boxPad + 2;
      for (const ln of brLines) {
        doc.text(ln, margin + boxPad, by, { lineBreak: false });
        by += lineH;
      }
      y += boxH + 10;
    }

    doc.font('Helvetica').fontSize(8.5).fillColor('#475569');
    const foot =
      p.syndicWhatsapp != null && p.syndicWhatsapp.length > 0
        ? `Após efetuar o pagamento, envie o comprovante (print ou PDF) para o WhatsApp do síndico: ${p.syndicWhatsapp.replace(/\s+/g, '')}.`
        : 'Após efetuar o pagamento, envie o comprovante (print ou PDF) ao síndico.';
    const footLines = this.wrapWordsToLines(doc, foot, contentW);
    const flh = doc.currentLineHeight(true) + 1.5;
    for (const fl of footLines) {
      doc.text(fl, margin, y, { width: contentW, lineBreak: false });
      y += flh;
    }
  }

  /** Capa curta (relatório geral ou slip sem PIX). */
  private renderIdentificationCoverPage(
    doc: InstanceType<typeof PDFDocument>,
    p: {
      margin: number;
      contentW: number;
      yStart: number;
      managementLogoBuffer: Buffer | null;
      condoName: string;
      competenceYmPtBr: string;
      periodLabel: string;
      withUnitSlipContext: boolean;
    },
  ): number {
    const accent = '#1a3a52';
    const muted = '#5a6572';
    let y = p.yStart;

    y = drawDocumentHeaderLogo(
      doc,
      p.margin,
      y,
      p.managementLogoBuffer,
      48,
    );

    doc.save();
    doc.rect(p.margin, y, 4, 58).fill(accent);
    doc.restore();
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#121820')
      .text(
        p.withUnitSlipContext
          ? 'Prestação de contas do condomínio'
          : 'Prestação de contas',
        p.margin + 14,
        y + 2,
        { lineBreak: false },
      );
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(muted)
      .text(
        p.withUnitSlipContext
          ? `Competência ${p.competenceYmPtBr} — fechamento mensal (todas as unidades)`
          : 'Taxa condominial — transparência',
        p.margin + 14,
        y + 32,
        { lineBreak: false },
      );
    y += 68;

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#121820');
    doc.text('Identificação do condomínio', p.margin, y, { lineBreak: false });
    y += 22;
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a1a');
    doc.text(p.condoName, p.margin, y, { lineBreak: false });
    y += 22;
    doc.font('Helvetica').fontSize(10.5).fillColor(muted);
    doc.text(`Competência ${p.competenceYmPtBr}`, p.margin, y, {
      lineBreak: false,
    });
    y += 18;
    doc.text(`Período: ${p.periodLabel}`, p.margin, y, { lineBreak: false });
    y += 24;
    doc.save();
    doc.strokeColor('#d4dbe3').lineWidth(0.9);
    doc
      .moveTo(p.margin, y)
      .lineTo(p.margin + p.contentW, y)
      .stroke();
    doc.restore();
    doc.fillColor('#000000');
    return y + 20;
  }

  private movementLineTypeLabelPt(
    lineType: string | undefined,
    kind: string,
    dueOnYmd?: string,
    todayYmd?: string,
  ): string {
    switch (lineType) {
      case 'fee_payment':
        return 'Taxa paga';
      case 'fee_overdue':
        if (dueOnYmd?.trim() && todayYmd?.trim()) {
          return openFeeLineTypeLabelPt(dueOnYmd, todayYmd);
        }
        return 'Taxa em atraso';
      default:
        return this.transactionKindLabelPt(kind);
    }
  }

  private transactionKindLabelPt(kind: string): string {
    switch (kind) {
      case 'income':
        return 'Receita';
      case 'expense':
        return 'Despesa';
      case 'investment':
        return 'Aplicação';
      case 'yield':
        return 'Rendimento';
      default:
        return kind;
    }
  }

  private txPaymentStatusLabelPt(
    status: string | undefined,
    lineType?: string,
    dueOnYmd?: string,
    todayYmd?: string,
  ): string {
    if (lineType === 'fee_overdue' && dueOnYmd?.trim() && todayYmd?.trim()) {
      return openFeeStatusLabelPt(dueOnYmd, todayYmd);
    }
    switch (status ?? 'pending') {
      case 'pending':
        return 'Aguardando';
      case 'paid':
        return 'Pago';
      case 'cancelled':
        return 'Cancelado';
      case 'overdue':
        return 'Em atraso';
      default:
        return 'Aguardando';
    }
  }

  private brlSignedDelta(cents: bigint): string {
    if (cents > 0n) {
      return `+ ${this.brl(cents)}`;
    }
    if (cents < 0n) {
      return `- ${this.brl(-cents)}`;
    }
    return this.brl(0n);
  }

  /**
   * Quitações e taxas em atraso no PDF de transparência não expõem unidade nem agrupamento.
   */
  private movementDescriptionForTransparencyPdf(
    row: StatementMovementRow,
    anonymizeFeeMovements: boolean,
  ): string {
    if (
      anonymizeFeeMovements &&
      (row.lineType === 'fee_payment' || row.lineType === 'fee_overdue')
    ) {
      const todayYmd = formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon());
      return genericFeeMovementTitle(
        row.lineType,
        row.competenceYm,
        row.occurredOn,
        todayYmd,
      );
    }
    return row.title.trim() || '—';
  }

  /** Linha de resumo (rótulo à esquerda, valor à direita). */
  private drawLedgerSummaryLine(
    doc: InstanceType<typeof PDFDocument>,
    margin: number,
    contentW: number,
    y: number,
    label: string,
    cents: bigint,
    opts?: { valueColor?: string; labelSize?: number },
  ): void {
    const accent = opts?.valueColor ?? '#1a3a52';
    const labelSize = opts?.labelSize ?? 8;
    doc.font('Helvetica').fontSize(labelSize).fillColor('#5a6572');
    doc.text(label, margin + 10, y, {
      lineBreak: false,
      width: contentW - 120,
    });
    const valStr = this.brlSigned(cents);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(accent);
    doc.text(valStr, margin + contentW - 10 - doc.widthOfString(valStr), y, {
      lineBreak: false,
    });
    doc.fillColor('#000000');
  }

  private renderLedgerOpeningBlockPdf(
    doc: InstanceType<typeof PDFDocument>,
    section: StatementLedgerSection,
    margin: number,
    contentW: number,
    yStart: number,
    isGeneral: boolean,
  ): number {
    const lines: { label: string; cents: bigint }[] = [
      { label: 'Saldo inicial', cents: BigInt(section.openingBalanceCents) },
    ];
    if (isGeneral && section.bankAccountsSeedCents != null) {
      let bankLbl = 'Contas bancárias (referência)';
      if (section.openingDerivedFromCurrentBalance) {
        bankLbl = section.bankAccountsAsOfYmd
          ? `Contas bancárias (saldo atual em ${this.formatYmdPtBr(section.bankAccountsAsOfYmd)})`
          : 'Contas bancárias (saldo atual)';
      }
      lines.push({
        label: bankLbl,
        cents: BigInt(section.bankAccountsSeedCents),
      });
      if (section.movementsOpeningBalanceCents != null) {
        lines.push({
          label: section.openingDerivedFromCurrentBalance
            ? 'Movimentos no período (deduzidos)'
            : 'Movimentos anteriores',
          cents: BigInt(section.movementsOpeningBalanceCents),
        });
      }
    }
    const lineH = 15;
    const hint =
      isGeneral && section.openingDerivedFromCurrentBalance
        ? 'O saldo inicial do mês é o saldo atual nas contas menos os lançamentos listados abaixo até a data indicada.'
        : null;
    const hintLines = hint
      ? this.wrapWordsToLines(doc, hint, contentW - 20)
      : [];
    const hintLh = doc.currentLineHeight(true) + 2;
    const boxH =
      12 + lines.length * lineH + (hintLines.length > 0 ? hintLines.length * hintLh + 6 : 0);

    let y = this.ensureSpace(doc, yStart, boxH + 6, margin);
    doc.save();
    doc
      .roundedRect(margin, y, contentW, boxH, 4)
      .fill('#f0f6fc')
      .strokeColor('#c5d4e8')
      .lineWidth(0.45)
      .stroke();
    doc.restore();

    let cy = y + 8;
    for (const line of lines) {
      this.drawLedgerSummaryLine(
        doc,
        margin,
        contentW,
        cy,
        line.label,
        line.cents,
        { labelSize: line.label === 'Saldo inicial' ? 7.5 : 7 },
      );
      cy += lineH;
    }
    if (hintLines.length > 0) {
      doc.font('Helvetica').fontSize(7).fillColor('#64748b');
      for (const hl of hintLines) {
        doc.text(hl, margin + 10, cy, { lineBreak: false, width: contentW - 20 });
        cy += hintLh;
      }
      doc.fillColor('#000000');
    }
    return y + boxH + 10;
  }

  private renderLedgerClosingFooterPdf(
    doc: InstanceType<typeof PDFDocument>,
    section: StatementLedgerSection,
    margin: number,
    contentW: number,
    yStart: number,
    isGeneral: boolean,
    hasOverdueInTable: boolean,
  ): number {
    let y = yStart + 6;
    const lines: { label: string; cents: bigint; overdue?: boolean }[] = [
      {
        label: isGeneral ? 'Saldo de caixa' : 'Saldo final no período',
        cents: BigInt(section.closingBalanceCents),
      },
    ];
    if (isGeneral) {
      const overdueTotal = BigInt(section.overdueFeesTotalCents ?? '0');
      if (overdueTotal > 0n) {
        lines.push({
          label: 'Total taxas em atraso',
          cents: overdueTotal,
          overdue: true,
        });
      }
      if (
        hasOverdueInTable &&
        section.projectedBalanceCents != null
      ) {
        lines.push({
          label: 'Saldo previsto (caixa + atrasos)',
          cents: BigInt(section.projectedBalanceCents),
        });
      }
    }
    const lineH = 16;
    const boxH = 12 + lines.length * lineH;
    y = this.ensureSpace(doc, y, boxH + 4, margin);
    doc.save();
    doc
      .roundedRect(margin, y, contentW, boxH, 4)
      .fill('#f8fafc')
      .strokeColor('#cbd5e1')
      .lineWidth(0.45)
      .stroke();
    doc.restore();
    let cy = y + 8;
    for (const line of lines) {
      this.drawLedgerSummaryLine(
        doc,
        margin,
        contentW,
        cy,
        line.label,
        line.cents,
        {
          valueColor: line.overdue ? '#0d5c2e' : '#1a3a52',
        },
      );
      cy += lineH;
    }
    return y + boxH + 6;
  }

  /**
   * Extrato linha a linha de conta geral ou fundo (mesma lógica do painel Extrato mensal).
   */
  private renderStatementLedgerSectionPdf(
    doc: InstanceType<typeof PDFDocument>,
    section: StatementLedgerSection,
    p: {
      margin: number;
      contentW: number;
      yStart: number;
      competenceYmPtBr: string;
      isGeneral: boolean;
      anonymizeFeeMovements: boolean;
    },
  ): number {
    const accent = '#1a3a52';
    const muted = '#5a6572';
    const gutter = 4;
    const colDateW = 46;
    const colTypeW = 54;
    const colStatusW = 48;
    const colAmtW = 58;
    const colBalW = 58;
    const colDescW = Math.max(
      80,
      p.contentW -
        colDateW -
        colTypeW -
        colStatusW -
        colAmtW -
        colBalW -
        5 * gutter,
    );
    const xDate = p.margin;
    const xType = xDate + colDateW + gutter;
    const xStatus = xType + colTypeW + gutter;
    const xDesc = xStatus + colStatusW + gutter;
    const xAmt = xDesc + colDescW + gutter;
    const xBal = xAmt + colAmtW + gutter;
    const rowMinH = 16;
    const headerH = 28;

    const sectionTitle = p.isGeneral
      ? 'Conta geral'
      : (section.fundName?.trim() || 'Fundo');
    const cashMovements = section.movements.filter(
      (m) => m.lineType !== 'fee_overdue',
    );
    const overdueMovements = section.movements.filter(
      (m) => m.lineType === 'fee_overdue',
    );

    let y = p.yStart;
    y = this.ensureSpace(doc, y, 72, p.margin);

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#121820');
    doc.text(sectionTitle, p.margin, y, { lineBreak: false });
    y += 22;

    y = this.renderLedgerOpeningBlockPdf(
      doc,
      section,
      p.margin,
      p.contentW,
      y,
      p.isGeneral,
    );

    const drawTableHeader = (): void => {
      y = this.ensureSpace(doc, y, headerH + 4, p.margin);
      doc.save();
      doc
        .rect(p.margin, y, p.contentW, headerH)
        .fill('#e8edf4')
        .strokeColor('#b8c4d4')
        .lineWidth(0.45)
        .stroke();
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(accent);
      doc.text('Data', xDate + 2, y + 9, { lineBreak: false });
      doc.text('Tipo', xType + 2, y + 9, { lineBreak: false });
      doc.text('Estado', xStatus + 2, y + 9, { lineBreak: false });
      doc.text('Descrição', xDesc + 2, y + 9, { lineBreak: false });
      const valHdr = p.isGeneral ? 'Valor' : 'Valor no fundo';
      doc.text(valHdr, xAmt + colAmtW - 2 - doc.widthOfString(valHdr), y + 9, {
        lineBreak: false,
      });
      const balHdr =
        overdueMovements.length > 0 && p.isGeneral ? 'Saldo / previsto' : 'Saldo após';
      doc.text(balHdr, xBal + colBalW - 2 - doc.widthOfString(balHdr), y + 9, {
        lineBreak: false,
      });
      y += headerH;
      doc.fillColor('#000000');
    };

    const todayYmd = formatDateOnlyYmdUtc(todayLocalCalendarAsUtcNoon());

    const drawMovementRow = (
      row: StatementMovementRow,
      projected: boolean,
    ): void => {
      const delta = BigInt(row.signedDeltaCents);
      const balance = BigInt(row.runningAfterCents);
      const descLines = this.wrapWordsToLines(
        doc,
        this.movementDescriptionForTransparencyPdf(
          row,
          p.anonymizeFeeMovements,
        ),
        colDescW - 4,
      );
      const descLh = doc.currentLineHeight(true) + 1.2;
      const rowH = Math.max(rowMinH, 6 + descLines.length * descLh);

      const yBefore = y;
      y = this.ensureSpace(doc, y, rowH + 2, p.margin);
      if (y <= p.margin && yBefore > p.margin + 4) {
        drawTableHeader();
      }
      if (projected) {
        doc.save();
        doc.rect(p.margin, y, p.contentW, rowH).fill('#faf8f0');
        doc.restore();
      }
      doc.save();
      doc.strokeColor('#e8ecf0').lineWidth(0.3);
      doc.moveTo(p.margin, y + rowH).lineTo(p.margin + p.contentW, y + rowH).stroke();
      doc.restore();

      doc.font('Helvetica').fontSize(7.5).fillColor('#333333');
      doc.text(this.formatYmdPtBr(row.occurredOn), xDate + 2, y + 5, {
        lineBreak: false,
      });
      doc.text(
        this.movementLineTypeLabelPt(row.lineType, row.kind, row.occurredOn, todayYmd)
          .slice(0, 18),
        xType + 2,
        y + 5,
        { lineBreak: false },
      );
      doc.text(
        this.txPaymentStatusLabelPt(
          row.paymentStatus,
          row.lineType,
          row.occurredOn,
          todayYmd,
        ).slice(0, 14),
        xStatus + 2,
        y + 5,
        { lineBreak: false },
      );
      let dy = y + 5;
      for (const dl of descLines) {
        doc.text(dl, xDesc + 2, dy, { lineBreak: false });
        dy += descLh;
      }
      const amtStr = this.brlSignedDelta(delta);
      doc.font('Helvetica-Bold').fontSize(7.5);
      doc.fillColor(delta >= 0n ? '#0d5c2e' : '#8b1a1a');
      doc.text(amtStr, xAmt + colAmtW - 2 - doc.widthOfString(amtStr), y + 5, {
        lineBreak: false,
      });
      const balStr = this.brlSigned(balance);
      doc.fillColor(balance < 0n ? '#8b1a1a' : '#0d1b26');
      doc.text(balStr, xBal + colBalW - 2 - doc.widthOfString(balStr), y + 5, {
        lineBreak: false,
      });
      doc.fillColor('#000000');
      y += rowH;
    };

    if (cashMovements.length === 0 && overdueMovements.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280');
      doc.text(
        p.isGeneral
          ? 'Nenhum movimento na conta geral neste período.'
          : 'Nenhum lançamento deste fundo no período.',
        p.margin,
        y,
        { lineBreak: false },
      );
      y += 20;
      doc.fillColor('#000000');
      y = this.renderLedgerClosingFooterPdf(
        doc,
        section,
        p.margin,
        p.contentW,
        y,
        p.isGeneral,
        false,
      );
      return y + 8;
    } else {
      drawTableHeader();
      for (const row of cashMovements) {
        drawMovementRow(row, false);
      }
      if (overdueMovements.length > 0) {
        y = this.ensureSpace(doc, y, rowMinH + 14, p.margin);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(accent);
        doc.text('Taxas previstas e em atraso', p.margin + 4, y, {
          lineBreak: false,
        });
        doc.font('Helvetica').fontSize(7.5).fillColor(muted);
        doc.text('— a receber; não entram no caixa', p.margin + 168, y, {
          lineBreak: false,
        });
        y += 16;
        doc.fillColor('#000000');
        for (const row of overdueMovements) {
          drawMovementRow(row, true);
        }
      }
    }

    y = this.renderLedgerClosingFooterPdf(
      doc,
      section,
      p.margin,
      p.contentW,
      y,
      p.isGeneral,
      overdueMovements.length > 0,
    );
    doc.fillColor('#000000');
    return y + 8;
  }

  private renderFinancialExtratoBody(
    doc: InstanceType<typeof PDFDocument>,
    ctx: {
      margin: number;
      contentW: number;
      yStart: number;
      competenceYmPtBr: string;
      periodLabel: string;
      statementGeneral: StatementLedgerSection;
      statementFundSections: StatementLedgerSection[];
      anonymizeFeeMovements: boolean;
    },
  ): number {
    const muted = '#5a6572';
    let y = ctx.yStart;

    y = this.ensureSpace(doc, y, 60, ctx.margin);
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#121820');
    doc.text('Extrato mensal', ctx.margin, y, { lineBreak: false });
    y += 20;
    doc.font('Helvetica').fontSize(9).fillColor(muted);
    doc.text(ctx.competenceYmPtBr, ctx.margin, y, { lineBreak: false });
    y += 14;
    const intro = this.wrapWordsToLines(
      doc,
      `Período ${ctx.periodLabel}. Conta geral do condomínio e extrato de cada fundo, na mesma ordem e com os mesmos saldos do painel «Extrato mensal».`,
      ctx.contentW,
    );
    const ilh = doc.currentLineHeight(true) + 2.5;
    y = this.drawTextLines(doc, ctx.margin, y, intro, ilh, ctx.margin);
    y += 16;
    doc.fillColor('#000000');

    y = this.renderStatementLedgerSectionPdf(doc, ctx.statementGeneral, {
      margin: ctx.margin,
      contentW: ctx.contentW,
      yStart: y,
      competenceYmPtBr: ctx.competenceYmPtBr,
      isGeneral: true,
      anonymizeFeeMovements: ctx.anonymizeFeeMovements,
    });
    y += 16;

    for (let i = 0; i < ctx.statementFundSections.length; i++) {
      const sec = ctx.statementFundSections[i]!;
      if (i > 0) {
        doc.addPage();
        doc.x = ctx.margin;
        doc.y = ctx.margin;
        y = ctx.margin;
      }
      y = this.renderStatementLedgerSectionPdf(doc, sec, {
        margin: ctx.margin,
        contentW: ctx.contentW,
        yStart: y,
        competenceYmPtBr: ctx.competenceYmPtBr,
        isGeneral: false,
        anonymizeFeeMovements: ctx.anonymizeFeeMovements,
      });
      y += 12;
    }

    return y;
  }

  private async renderPdf(ctx: {
    condoName: string;
    competenceYm: string;
    periodLabel: string;
    managementLogoBuffer: Buffer | null;
    competenceYmPtBr: string;
    unitCols: UnitCol[];
    targetUnit: UnitCol | null;
    billingPixKey?: string | null;
    billingPixBeneficiaryName?: string | null;
    billingPixCity?: string | null;
    transparencyPdfIncludePixQrCode?: boolean;
    syndicWhatsappForReceipts?: string | null;
    openChargesForTargetPix: CondominiumFeeCharge[];
    competenceCharges: CondominiumFeeCharge[];
    fixos: FinancialTransaction[];
    variavel: FinancialTransaction[];
    fundMensalidadeTxs: FinancialTransaction[];
    administracao: AdministracaoPdf;
    agrupamentosRows: AgrupamentosPdfRow[];
    statementGeneral: StatementLedgerSection;
    statementFundSections: StatementLedgerSection[];
    /** Oculta unidade/agrupamento em quitações e taxas em atraso (slip do condômino). */
    anonymizeFeeMovements: boolean;
  }): Promise<Buffer> {
    const margin = 56;
    /** Faixa inferior para rodapé (logo meucondominio.cloud à direita + linha). */
    const footerReserve = 102;

    const competenceYmPtBr = this.formatCompetenceYmPtBr(ctx.competenceYm);

    const pixOpenCharges = ctx.openChargesForTargetPix;
    const pixKeySan = sanitizePixKey(ctx.billingPixKey);
    const prependPixSlip =
      ctx.targetUnit != null &&
      pixOpenCharges.length > 0 &&
      pixKeySan.length > 0;

    let totalOpenCents = 0n;
    for (const c of pixOpenCharges) {
      totalOpenCents += BigInt(String(c.amountDueCents));
    }

    let pixBrPayload: string | null = null;
    let pixQrPng: Buffer | null = null;
    if (prependPixSlip && ctx.transparencyPdfIncludePixQrCode !== false) {
      try {
        const benName = sanitizePixName(
          ctx.billingPixBeneficiaryName?.trim() || ctx.condoName,
          25,
        );
        const benCity = sanitizePixCity(
          ctx.billingPixCity?.trim() || 'Brasil',
          15,
        );
        const msg = this.buildPixMessageForOpenCharges(
          pixOpenCharges,
          ctx.condoName,
        );
        const amt = Number(totalOpenCents) / 100;
        pixBrPayload = buildPixBrCode({
          key: pixKeySan,
          name: benName || sanitizePixName(ctx.condoName, 25),
          city: benCity || 'Brasil',
          amount: amt > 0 ? amt : undefined,
          message: msg,
        });
        pixQrPng = await QRCode.toBuffer(pixBrPayload, {
          type: 'png',
          width: 320,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
      } catch {
        pixBrPayload = null;
        pixQrPng = null;
      }
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        bufferPages: true,
        margins: {
          top: margin,
          bottom: footerReserve,
          left: margin,
          right: margin,
        },
        info: {
          Title: `Transparência — ${this.formatCompetenceYmPtBr(ctx.competenceYm)}`,
          Author: ctx.condoName.slice(0, 120),
        },
      });
      installPlatformWatermarkUnderAllContent(doc);
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const contentW = pageW - margin * 2;

      if (prependPixSlip && ctx.targetUnit) {
        const n = pixOpenCharges.length;
        const isConsolidated = n > 1;
        const firstC = pixOpenCharges[0]!;
        const lastC = pixOpenCharges[n - 1]!;
        const totalBrl = this.brl(totalOpenCents);
        const openChargeRows = pixOpenCharges.map((c) => ({
          competencia: this.formatCompetenceYmPtBr(c.competenceYm),
          vencimento: this.formatDateBr(c.dueOn),
          valor: this.brl(BigInt(String(c.amountDueCents))),
        }));
        const refLine = isConsolidated
          ? `Referência: ${ctx.condoName} — quitação de ${n} competências em aberto (${this.formatCompetenceYmPtBr(firstC.competenceYm)} a ${this.formatCompetenceYmPtBr(lastC.competenceYm)})`
              .slice(0, 100)
          : `Referência: ${ctx.condoName} — ${this.formatCompetenceYmPtBr(firstC.competenceYm)}`.slice(
                0,
                100,
              );
        this.renderUnitPixPaymentSlipCoverPage(doc, {
          margin,
          contentW,
          condoName: ctx.condoName,
          unitIdentifier: ctx.targetUnit.identifier.trim() || '—',
          groupingName: (ctx.targetUnit.groupingName?.trim() || '—').slice(
            0,
            56,
          ),
          responsibleName: ctx.targetUnit.responsibleName,
          competenceBlockTitle: isConsolidated
            ? `Soma de ${n} taxas condominiais em aberto`
            : this.formatCompetenceYmPtBr(firstC.competenceYm),
          competenceBlockSubtitle: isConsolidated
            ? `De ${this.formatCompetenceYmPtBr(firstC.competenceYm)} a ${this.formatCompetenceYmPtBr(lastC.competenceYm)}`
            : null,
          dueOnBr: isConsolidated ? 'Diversos' : this.formatDateBr(firstC.dueOn),
          statusLabel: isConsolidated
            ? 'Em aberto (soma a quitar)'
            : this.feeChargeStatusLabelPt(firstC.status),
          totalAmountBrl: totalBrl,
          referenceLine: refLine,
          showOpenChargesBreakdown: isConsolidated,
          openChargeRows,
          hintLine: isConsolidated
            ? 'O valor a pagar corresponde à quitação total de todas as taxas condominiais em aberto listadas abaixo (inclui competências anteriores à do relatório anexo, se aplicável). O QR e o PIX têm o montante agregado. Nas páginas seguintes: extrato mensal (conta geral e fundos), igual ao painel do condomínio.'
            : 'Slip de pagamento via PIX — específico para a unidade. Nas páginas seguintes: extrato mensal (conta geral e fundos), igual ao painel do condomínio.',
          pixKeyDisplay: (ctx.billingPixKey ?? pixKeySan).trim().slice(0, 64),
          beneficiaryDisplay: (
            ctx.billingPixBeneficiaryName?.trim() || ctx.condoName
          ).slice(0, 80),
          pixBrPayload,
          pixQrPng,
          showBrCopyPaste:
            ctx.transparencyPdfIncludePixQrCode !== false && !!pixBrPayload,
          syndicWhatsapp: ctx.syndicWhatsappForReceipts?.trim() || null,
        });
        doc.addPage();
        doc.x = margin;
        doc.y = margin;
      }

      let y = margin;

      if (ctx.targetUnit) {
        y = this.renderIdentificationCoverPage(doc, {
          margin,
          contentW,
          yStart: y,
          managementLogoBuffer: ctx.managementLogoBuffer,
          condoName: ctx.condoName,
          competenceYmPtBr,
          periodLabel: ctx.periodLabel,
          withUnitSlipContext: true,
        });
        y = this.renderSlipFollowFeeContextSection(doc, {
          margin,
          contentW,
          yStart: y,
          competenceYmPtBr,
          targetUnitIdentifier:
            ctx.targetUnit.identifier.trim() || '—',
          unitCols: ctx.unitCols,
          charges: ctx.competenceCharges,
          highlightUnitId: ctx.targetUnit.unitId,
        });
      } else if (!prependPixSlip) {
        y = this.renderIdentificationCoverPage(doc, {
          margin,
          contentW,
          yStart: y,
          managementLogoBuffer: ctx.managementLogoBuffer,
          condoName: ctx.condoName,
          competenceYmPtBr,
          periodLabel: ctx.periodLabel,
          withUnitSlipContext: false,
        });
      }

      y = this.renderCondominioCadastroDedicatedPage(
        doc,
        margin,
        contentW,
        ctx.administracao,
        ctx.agrupamentosRows,
      );

      y = this.renderFinancialExtratoBody(doc, {
        margin,
        contentW,
        yStart: y,
        competenceYmPtBr,
        periodLabel: ctx.periodLabel,
        statementGeneral: ctx.statementGeneral,
        statementFundSections: ctx.statementFundSections,
        anonymizeFeeMovements: ctx.anonymizeFeeMovements,
      });

      y = this.renderExtratoPorAgrupamentoSection(doc, {
        margin,
        contentW,
        yStart: y,
        unitCols: ctx.unitCols,
        fixos: ctx.fixos,
        variavel: ctx.variavel,
        fundMensalidadeTxs: ctx.fundMensalidadeTxs,
        charges: ctx.competenceCharges,
        competenceYmPtBr,
        highlightUnitId: ctx.targetUnit?.unitId ?? null,
      });

      const readabilityW = Math.max(320, contentW - 140);
      y = this.ensureSpace(doc, y, 36, margin);
      doc.font('Helvetica').fontSize(7.5).fillColor('#666666');
      const footLines = this.wrapWordsToLines(
        doc,
        'Documento gerado eletronicamente para fins de transparência financeira perante os condôminos. Extrato do período da competência conforme lançamentos registrados no sistema na data de emissão.',
        readabilityW,
      );
      const footLh = doc.currentLineHeight(true) + 1.5;
      y = this.drawTextLines(doc, margin, y, footLines, footLh, margin);

      stampPlatformFooterOnAllPages(doc, { showDomainLabel: false });
      doc.end();
    });
  }

  /**
   * Demonstrativo tipo fluxo de caixa: receitas (quitações da taxa + demais receitas),
   * despesas e aplicações no período, agrupadas por fundo quando aplicável.
   */
  private renderCashFlowDetailed(
    doc: InstanceType<typeof PDFDocument>,
    periodTransactions: FinancialTransaction[],
    periodLabel: string,
    charges: CondominiumFeeCharge[],
    /** Competência só para texto (ex.: `Março/2026`). */
    competenceYmPtBr: string,
    margin: number,
    contentW: number,
    yStart: number,
  ): number {
    const lineGap = 13;
    const rowIndent = 8;
    const gutter = 6;
    const cfDateW = 52;
    const cfTypeW = 70;
    const cfAmtW = 82;
    const innerW = contentW - rowIndent;
    const cfDescW = Math.max(
      72,
      innerW - cfDateW - cfTypeW - cfAmtW - 3 * gutter,
    );
    const cfAccent = '#1a3a52';
    const xDate = margin + rowIndent;
    const xDesc = xDate + cfDateW + gutter;
    const xType = xDesc + cfDescW + gutter;
    const xAmt = xType + cfTypeW + gutter;
    const descWrapW = Math.max(40, cfDescW - 4);

    let y = yStart;
    y = this.ensureSpace(doc, y, lineGap * 4, margin);

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#121820');
    doc.text('Movimentos do período por fundo', margin, y, { lineBreak: false });
    y += 22;
    doc.font('Helvetica').fontSize(9.5).fillColor('#5a6572');
    const intro = `Lançamentos entre ${periodLabel}. O extrato resumido de cada fundo (saldo anterior, receitas e despesas do mês e saldo final) está na tabela anterior. Aqui, «Valor» é o montante de cada movimento (não o saldo). Em Receitas: quitações da taxa condominial (competência ${competenceYmPtBr}) e demais receitas; se a quitação tiver receita contábil vinculada, essa receita não é repetida abaixo.`;
    const introLines = this.wrapWordsToLines(doc, intro, contentW);
    const introLh = doc.currentLineHeight(true) + 3.5;
    y = this.drawTextLines(doc, margin, y, introLines, introLh, margin);
    y += 14;
    doc.fillColor('#000000');

    const hdrH = lineGap + 10;
    y = this.ensureSpace(doc, y, hdrH + 6, margin);
    doc.save();
    doc
      .roundedRect(margin, y - 2, contentW, hdrH, 5)
      .fill('#e8edf4')
      .strokeColor('#b8c4d4')
      .lineWidth(0.55)
      .stroke();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(cfAccent);
    doc.text('Data', xDate, y + 7, { lineBreak: false });
    doc.text('Histórico', xDesc, y + 7, { lineBreak: false });
    const natHdr = 'Natureza';
    doc.text(natHdr, xType + cfTypeW - doc.widthOfString(natHdr), y + 7, {
      lineBreak: false,
    });
    const valHdr = 'Valor';
    doc.text(valHdr, xAmt + cfAmtW - doc.widthOfString(valHdr), y + 7, {
      lineBreak: false,
    });
    y += hdrH + 12;
    doc.fillColor('#000000');

    const incomesAll = periodTransactions.filter(
      (t) => t.kind === 'income' && t.paymentStatus !== 'cancelled',
    );
    const outflows = periodTransactions.filter(
      (t) =>
        (t.kind === 'expense' || t.kind === 'investment') &&
        t.paymentStatus !== 'cancelled',
    );

    const sumCents = (rows: FinancialTransaction[]): bigint => {
      let s = 0n;
      for (const t of rows) {
        s += BigInt(String(t.amountCents));
      }
      return s;
    };

    const paidCharges = charges.filter((c) => c.status === 'paid');
    const linkedIncomeIds = new Set(
      paidCharges
        .map((c) => c.incomeTransactionId?.trim())
        .filter((id): id is string => Boolean(id)),
    );
    const incomes = incomesAll.filter((t) => !linkedIncomeIds.has(t.id));

    let feeReceiptsTotal = 0n;
    for (const c of paidCharges) {
      feeReceiptsTotal += BigInt(String(c.amountDueCents));
    }
    const incomeTotal = feeReceiptsTotal + sumCents(incomes);
    const outTotal = sumCents(outflows);

    const drawSectionTitle = (title: string) => {
      y = this.ensureSpace(doc, y, lineGap + 20, margin);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(cfAccent);
      doc.text(title, margin, y, { lineBreak: false });
      y += lineGap + 12;
      doc.fillColor('#000000');
    };

    const drawFundGroup = (fundLabel: string, rows: FinancialTransaction[]) => {
      const gSum = sumCents(rows);
      y = this.ensureSpace(doc, y, lineGap * 2 + 14, margin);
      doc.save();
      doc
        .roundedRect(margin, y - 3, contentW, lineGap * 2 + 18, 4)
        .fill('#f4f7fb')
        .strokeColor('#d8e0ea')
        .lineWidth(0.45)
        .stroke();
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1a1a1a');
      doc.text(fundLabel.toUpperCase().slice(0, 68), margin + 10, y + 4, {
        lineBreak: false,
      });
      y += lineGap + 2;
      doc.font('Helvetica').fontSize(8).fillColor('#334155');
      doc.text(`Soma no período (linhas abaixo): ${this.brl(gSum)}`, margin + 10, y, {
        lineBreak: false,
      });
      y += lineGap + 10;
      doc.fillColor('#000000');

      let rowIdx = 0;
      for (const t of rows) {
        doc.font('Helvetica').fontSize(7.5);
        const titleLines = this.wrapWordsToLines(
          doc,
          this.displayTransactionTitleForPdf(t.title),
          descWrapW,
        );
        const rowH = Math.max(1, titleLines.length) * lineGap;
        y = this.ensureSpace(doc, y, rowH + 2, margin);
        if (rowIdx % 2 === 1) {
          doc.save();
          doc
            .rect(margin + rowIndent, y - 1, contentW - rowIndent + 2, rowH + 2)
            .fill('#fafbfc');
          doc.restore();
        }
        doc.fillColor('#111827');
        const dStr = this.formatDateBr(t.occurredOn);
        doc.text(dStr, xDate + cfDateW - doc.widthOfString(dStr), y, {
          lineBreak: false,
        });
        let ty = y;
        for (const tl of titleLines) {
          doc.text(tl, xDesc, ty, { lineBreak: false });
          ty += lineGap;
        }
        const kindStr = this.kindLabelPt(t.kind);
        doc.text(kindStr, xType + cfTypeW - doc.widthOfString(kindStr), y, {
          lineBreak: false,
        });
        const amtStr = this.brl(BigInt(String(t.amountCents)));
        doc.text(amtStr, xAmt + cfAmtW - doc.widthOfString(amtStr), y, {
          lineBreak: false,
        });
        y += rowH;
        rowIdx += 1;
      }
      y += 4;
    };

    drawSectionTitle('(+) Receitas');
    if (paidCharges.length === 0 && incomes.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280');
      doc.text(
        'Sem quitações da taxa nem outras receitas registradas no período.',
        xDate,
        y,
        { lineBreak: false },
      );
      y += lineGap + 6;
      doc.fillColor('#000000');
    } else {
      if (paidCharges.length > 0) {
        const paidSorted = [...paidCharges].sort((a, b) => {
          const at = this.chargePaidAtSortMs(a.paidAt);
          const bt = this.chargePaidAtSortMs(b.paidAt);
          if (at !== bt) {
            return at - bt;
          }
          return (a.unit?.identifier ?? '').localeCompare(
            b.unit?.identifier ?? '',
            'pt',
          );
        });
        y = this.ensureSpace(doc, y, lineGap * 2 + 14, margin);
        doc.save();
        doc
          .roundedRect(margin, y - 3, contentW, lineGap * 2 + 18, 4)
          .fill('#f0f7f2')
          .strokeColor('#c5ddd0')
          .lineWidth(0.45)
          .stroke();
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#1a1a1a');
        doc.text(
          'QUITADAS — TAXA CONDOMINIAL (PAGAMENTOS / RECEBIMENTOS)',
          margin + 10,
          y + 4,
          { lineBreak: false },
        );
        y += lineGap + 2;
        doc.font('Helvetica').fontSize(8).fillColor('#334155');
        doc.text(
          `Soma das quitações: ${this.brl(feeReceiptsTotal)} · competência ${competenceYmPtBr}`,
          margin + 10,
          y,
          { lineBreak: false },
        );
        y += lineGap + 10;
        doc.fillColor('#000000');

        let feeRowIdx = 0;
        for (const c of paidSorted) {
          doc.font('Helvetica').fontSize(7.5);
          const uid = c.unit?.identifier?.trim() || '—';
          const grp = c.unit?.grouping?.name?.trim();
          const desc = grp
            ? `Pagamento taxa condominial — ${uid} (${grp})`
            : `Pagamento taxa condominial — ${uid}`;
          const descLines = this.wrapWordsToLines(doc, desc, descWrapW);
          const rowH = Math.max(1, descLines.length) * lineGap;
          y = this.ensureSpace(doc, y, rowH + 2, margin);
          if (feeRowIdx % 2 === 1) {
            doc.save();
            doc
              .rect(margin + rowIndent, y - 1, contentW - rowIndent + 2, rowH + 2)
              .fill('#fafcfb');
            doc.restore();
          }
          doc.fillColor('#111827');
          const pd = this.formatDateBr(c.paidAt);
          doc.text(pd, xDate + cfDateW - doc.widthOfString(pd), y, {
            lineBreak: false,
          });
          let dy = y;
          for (const dl of descLines) {
            doc.text(dl, xDesc, dy, { lineBreak: false });
            dy += lineGap;
          }
          const feeKind = 'Recebimento taxa';
          doc.text(feeKind, xType + cfTypeW - doc.widthOfString(feeKind), y, {
            lineBreak: false,
          });
          const amt = BigInt(String(c.amountDueCents));
          const amtStr = this.brl(amt);
          doc.text(amtStr, xAmt + cfAmtW - doc.widthOfString(amtStr), y, {
            lineBreak: false,
          });
          y += rowH;
          feeRowIdx += 1;
        }
        y += 6;
      }

      if (incomes.length > 0) {
        if (paidCharges.length > 0) {
          y = this.ensureSpace(doc, y, lineGap + 12, margin);
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(cfAccent);
          doc.text('Demais receitas (lançamentos no período)', margin, y, {
            lineBreak: false,
          });
          y += lineGap + 8;
          doc.fillColor('#000000');
        }
        for (const { fundLabel, items } of this.groupTransactionsByFund(
          incomes,
        )) {
          drawFundGroup(fundLabel, items);
        }
      }
    }
    y = this.ensureSpace(doc, y, lineGap + 6, margin);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d1b26');
    doc.text('Total de receitas', xDate, y, { lineBreak: false });
    const incStr = this.brl(incomeTotal);
    doc.text(incStr, xAmt + cfAmtW - doc.widthOfString(incStr), y, {
      lineBreak: false,
    });
    y += lineGap + 14;

    drawSectionTitle('(-) Despesas e aplicações em fundos');
    if (outflows.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280');
      doc.text('Sem despesas nem aplicações registradas no período.', xDate, y, {
        lineBreak: false,
      });
      y += lineGap + 6;
      doc.fillColor('#000000');
    } else {
      for (const { fundLabel, items } of this.groupTransactionsByFund(
        outflows,
      )) {
        drawFundGroup(fundLabel, items);
      }
    }
    y = this.ensureSpace(doc, y, lineGap + 6, margin);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0d1b26');
    doc.text('Total de despesas e aplicações', xDate, y, { lineBreak: false });
    const outStr = this.brl(outTotal);
    doc.text(outStr, xAmt + cfAmtW - doc.widthOfString(outStr), y, {
      lineBreak: false,
    });
    y += lineGap + 14;

    const net = incomeTotal - outTotal;
    y = this.ensureSpace(doc, y, lineGap * 2 + 8, margin);
    doc.save();
    doc.lineWidth(0.5).strokeColor('#aaaaaa');
    doc
      .moveTo(margin, y)
      .lineTo(margin + contentW, y)
      .stroke();
    doc.restore();
    y += 6;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0d1b26');
    const resultLabel =
      '(=) Resultado do período (receitas incl. taxa quitada - despesas e aplicações)';
    const labelMaxW = Math.max(120, xAmt - xDate - 12);
    const resultLines = this.wrapWordsToLines(doc, resultLabel, labelMaxW);
    const resLh = doc.currentLineHeight(true) + 1;
    const blockH = resultLines.length * resLh;
    y = this.ensureSpace(doc, y, blockH + 4, margin);
    let ry = y;
    for (const rl of resultLines) {
      doc.text(rl, xDate, ry, { lineBreak: false });
      ry += resLh;
    }
    const netStr = this.brl(net);
    doc.text(netStr, xAmt + cfAmtW - doc.widthOfString(netStr), y, {
      lineBreak: false,
    });
    y = ry + 4;
    doc.save();
    doc.lineWidth(0.5).strokeColor('#000000');
    doc
      .moveTo(margin, y)
      .lineTo(margin + contentW, y)
      .stroke();
    doc.restore();
    y += 12;

    return y;
  }

  private formatDateYmdBr(ymd: string): string {
    const head = ymd.trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
    if (!m) {
      return head;
    }
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  /** `paid_at` pode vir como `Date` ou string (`YYYY-MM-DD`) do driver ORM. */
  private chargePaidAtSortMs(paidAt: Date | string | null | undefined): number {
    if (paidAt == null) {
      return 0;
    }
    if (paidAt instanceof Date) {
      const n = paidAt.getTime();
      return Number.isNaN(n) ? 0 : n;
    }
    const head = String(paidAt).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) {
      const n = new Date(String(paidAt)).getTime();
      return Number.isNaN(n) ? 0 : n;
    }
    return parseDateOnlyFromApi(head).getTime();
  }

  private formatDateBr(d: Date | string | null | undefined): string {
    if (d == null) {
      return '—';
    }
    return this.formatDateYmdBr(formatDateOnlyYmdUtc(d));
  }

  private kindLabelPt(kind: string): string {
    switch (kind) {
      case 'income':
        return 'Receita';
      case 'expense':
        return 'Despesa';
      case 'investment':
        return 'Aplicação';
      case 'yield':
        return 'Rendimento';
      default:
        return kind;
    }
  }

  private groupTransactionsByFund(
    txs: FinancialTransaction[],
  ): {
    fundId: string | null;
    fundLabel: string;
    items: FinancialTransaction[];
  }[] {
    const map = new Map<
      string,
      {
        fundId: string | null;
        fundLabel: string;
        items: FinancialTransaction[];
      }
    >();
    for (const t of txs) {
      const fundId = t.fundId ?? null;
      const fundLabel = t.fund?.name?.trim() || '— Sem fundo —';
      const key = fundId ?? '__no_fund__';
      const cur = map.get(key);
      if (cur) {
        cur.items.push(t);
      } else {
        map.set(key, { fundId, fundLabel, items: [t] });
      }
    }
    const keys = [...map.keys()].sort((a, b) => {
      const la = map.get(a)!.fundLabel;
      const lb = map.get(b)!.fundLabel;
      return la.localeCompare(lb, 'pt-BR');
    });
    return keys.map((k) => {
      const { fundId, fundLabel, items } = map.get(k)!;
      items.sort((a, b) => {
        const da = formatDateOnlyYmdUtc(a.occurredOn).localeCompare(
          formatDateOnlyYmdUtc(b.occurredOn),
        );
        if (da !== 0) {
          return da;
        }
        return a.id.localeCompare(b.id);
      });
      return { fundId, fundLabel, items };
    });
  }

  /** Usa `page.maxY()` e, ao mudar de página, repõe `doc.x`/`doc.y` para não desincronizar o PDFKit. */
  private ensureSpace(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc: any,
    y: number,
    need: number,
    margin: number,
  ): number {
    const bottom = doc.page.maxY();
    if (y + need > bottom) {
      doc.addPage();
      doc.x = margin;
      doc.y = margin;
      return margin;
    }
    return y;
  }

  /**
   * Valor total = `amountCents` do lançamento. Cotas por unidade: somam sempre esse
   * total na tabela (incorpora diferenças de arredondamento do rateio registrado).
   */
  private expenseRowAmountsForUnitTable(
    t: FinancialTransaction,
    unitCols: UnitCol[],
  ): { declared: bigint; byUnit: bigint[] } {
    const map = new Map<string, bigint>();
    for (const s of t.unitShares ?? []) {
      const v = BigInt(String(s.shareCents));
      const abs = v < 0n ? -v : v;
      map.set(s.unitId, (map.get(s.unitId) ?? 0n) + abs);
    }
    const byUnitRaw: bigint[] = [];
    let sumShares = 0n;
    for (const u of unitCols) {
      const v = map.get(u.unitId) ?? 0n;
      byUnitRaw.push(v);
      sumShares += v;
    }
    const declared = BigInt(String(t.amountCents));
    if (sumShares <= 0n) {
      return { declared, byUnit: byUnitRaw };
    }
    const delta = declared - sumShares;
    if (delta === 0n) {
      return { declared, byUnit: byUnitRaw };
    }
    const adj = this.distributeSignedRounding(delta, byUnitRaw);
    const byUnit = byUnitRaw.map((v, i) => v + adj[i]!);
    return { declared, byUnit };
  }

  /**
   * Reparte `delta` (soma = `delta`) pelas colunas com cota &gt; 0; se não houver,
   * reparte por todas as colunas. Usa o mesmo critério de restos que `distributePositiveCents`.
   */
  private distributeSignedRounding(delta: bigint, byUnit: bigint[]): bigint[] {
    const out = byUnit.map(() => 0n);
    if (delta === 0n) {
      return out;
    }
    const targets = byUnit
      .map((v, i) => (v > 0n ? i : -1))
      .filter((i): i is number => i >= 0);
    const useIdx =
      targets.length > 0 ? targets : byUnit.map((_, i) => i);
    const absD = delta < 0n ? -delta : delta;
    const sign = delta < 0n ? -1n : 1n;
    const parts = distributePositiveCents(absD, useIdx.length);
    for (let k = 0; k < useIdx.length; k++) {
      out[useIdx[k]!] = sign * parts[k]!;
    }
    return out;
  }

  private participatingUnitIndicesForTx(
    t: FinancialTransaction,
    unitCols: UnitCol[],
  ): number[] {
    const ids = new Set((t.unitShares ?? []).map((s) => s.unitId));
    const out: number[] = [];
    for (let i = 0; i < unitCols.length; i++) {
      if (ids.has(unitCols[i]!.unitId)) {
        out.push(i);
      }
    }
    return out;
  }

  /**
   * Só **acrescenta** centavos quando a soma das cotas (já niveladas por tipo)
   * fica abaixo do total do lançamento: +1 ¢ em todas as unidades da mesma classe
   * de cada vez, quando possível; o restante reparte-se só para cima.
   * Nunca subtrai — evita cotas desiguais no mesmo agrupamento e prefere sobra.
   */
  private addExtratoRowDeltaPreservingGroups(
    delta: bigint,
    out: bigint[],
    unitCols: UnitCol[],
    participatingIdx: number[],
  ): void {
    if (delta <= 0n) {
      return;
    }
    const byKey = new Map<string, number[]>();
    for (const i of participatingIdx) {
      const k = groupingFeeEquivalenceKey(
        unitCols[i]!.groupingName,
        unitCols[i]!.groupingId,
      );
      const arr = byKey.get(k) ?? [];
      arr.push(i);
      byKey.set(k, arr);
    }
    const classes = [...byKey.values()].filter((c) => c.length > 0);
    let d = delta;
    let guard = 0;
    while (d > 0n && guard++ < 10_000) {
      let moved = false;
      const sorted = [...classes].sort((a, b) => a.length - b.length);
      for (const idxs of sorted) {
        const n = BigInt(idxs.length);
        if (d >= n) {
          for (const i of idxs) {
            out[i] = out[i]! + 1n;
          }
          d -= n;
          moved = true;
          break;
        }
      }
      if (!moved) {
        break;
      }
    }
    if (d > 0n) {
      const adj = this.distributeSignedRounding(d, out);
      for (let i = 0; i < out.length; i++) {
        out[i] = out[i]! + adj[i]!;
      }
    }
  }

  /**
   * Extrato: por lançamento, todas as unidades do **mesmo agrupamento** (chave de
   * equivalência) veem a **mesma cota**, igual ao **maior** valor entre elas naquele
   * lançamento. Se a soma ficar abaixo do total contabilístico, acrescenta-se só
   * para cima (por classe quando possível). Se ficar **acima**, **não** reduz —
   * prefere-se sobra a falta e evita segregação injusta entre condôminos equivalentes.
   */
  private equalizeExtratoRowShares(
    unitCols: UnitCol[],
    declared: bigint,
    byUnit: bigint[],
    participatingIdx: number[],
  ): bigint[] {
    const out = [...byUnit];
    if (participatingIdx.length === 0) {
      return out;
    }
    const byKey = new Map<string, number[]>();
    for (const i of participatingIdx) {
      const uc = unitCols[i]!;
      const k = groupingFeeEquivalenceKey(uc.groupingName, uc.groupingId);
      const arr = byKey.get(k) ?? [];
      arr.push(i);
      byKey.set(k, arr);
    }
    for (const idxs of byKey.values()) {
      let mx = 0n;
      for (const i of idxs) {
        if (out[i]! > mx) {
          mx = out[i]!;
        }
      }
      for (const i of idxs) {
        out[i] = mx;
      }
    }
    const sum = out.reduce((a, b) => a + b, 0n);
    const delta = declared - sum;
    if (delta > 0n) {
      this.addExtratoRowDeltaPreservingGroups(
        delta,
        out,
        unitCols,
        participatingIdx,
      );
    }
    return out;
  }

  /** Linha da tabela resumida (descritivo com quebra + total à direita). */
  private drawSummaryTwoColumnRow(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc: any,
    margin: number,
    y: number,
    minRowH: number,
    descW: number,
    totalW: number,
    label: string,
    lineTotal: bigint,
  ): number {
    doc.font('Helvetica').fontSize(8);
    const lines = this.wrapWordsToLines(doc, label, descW - 10);
    const lh = doc.currentLineHeight(true) + 2;
    const rowH = Math.max(minRowH, 6 + lines.length * lh);
    y = this.ensureSpace(doc, y, rowH + 2, margin);
    let x = margin;
    doc.fillColor('#000000');
    doc.rect(x, y, descW, rowH).stroke('#e5e7eb');
    let ty = y + 5;
    for (const line of lines) {
      doc.text(line, x + 5, ty, { lineBreak: false });
      ty += lh;
    }
    x += descW;
    doc.rect(x, y, totalW, rowH).stroke('#e5e7eb');
    const totStr = this.brl(lineTotal);
    const totY = y + Math.max(5, (rowH - lh) / 2);
    doc.text(totStr, x + totalW - 4 - doc.widthOfString(totStr), totY, {
      lineBreak: false,
    });
    return y + rowH;
  }

  /** Mensalidades automáticas de fundo da competência (cota por unidade na taxa). */
  private async loadFundMensalidadeTransactionsForUnitExtrato(
    condominiumId: string,
    competenceYm: string,
  ): Promise<FinancialTransaction[]> {
    const accruals = await this.fundAccrualRepo.find({
      where: { competenceYm },
      relations: { fund: true },
    });
    const txIds = accruals
      .filter((a) => a.fund?.condominiumId === condominiumId)
      .map((a) => a.transactionId);
    if (txIds.length === 0) {
      return [];
    }
    const txs = await this.txRepo.find({
      where: {
        id: In(txIds),
        condominiumId,
        paymentStatus: Not('cancelled'),
      },
      relations: { unitShares: true, fund: true },
    });
    return txs.sort((a, b) =>
      (a.fund?.name ?? a.title).localeCompare(b.fund?.name ?? b.title, 'pt', {
        sensitivity: 'base',
      }),
    );
  }

  /** Assinatura de cotas + taxa para comparar unidades dentro do agrupamento. */
  private extratoProfileSignature(amounts: bigint[]): string {
    return amounts.map((v) => v.toString()).join('|');
  }

  /** Monta perfil de cotas (despesas niveladas + taxa) por índice em `unitCols`. */
  private buildExtratoProfilesByUnitIndex(
    unitCols: UnitCol[],
    expenseRows: FinancialTransaction[],
    fundMensalidadeRows: FinancialTransaction[],
    chargeByUnit: Map<string, bigint>,
  ): bigint[][] {
    const profiles: bigint[][] = unitCols.map(() => []);
    const pushRowAmounts = (t: FinancialTransaction): void => {
      const { declared, byUnit: rawByUnit } = this.expenseRowAmountsForUnitTable(
        t,
        unitCols,
      );
      const partIdx = this.participatingUnitIndicesForTx(t, unitCols);
      const byUnit = this.equalizeExtratoRowShares(
        unitCols,
        declared,
        rawByUnit,
        partIdx,
      );
      for (let ui = 0; ui < unitCols.length; ui++) {
        profiles[ui]!.push(byUnit[ui] ?? 0n);
      }
    };
    for (const t of expenseRows) {
      pushRowAmounts(t);
    }
    for (const t of fundMensalidadeRows) {
      pushRowAmounts(t);
    }
    for (let ui = 0; ui < unitCols.length; ui++) {
      profiles[ui]!.push(chargeByUnit.get(unitCols[ui]!.unitId) ?? 0n);
    }
    return profiles;
  }

  private unitExtratoRowLabel(
    t: FinancialTransaction,
    fundMensalidadeIds: Set<string>,
  ): string {
    if (fundMensalidadeIds.has(t.id)) {
      const fundName = t.fund?.name?.trim();
      const base = fundName
        ? `Mensalidade — ${fundName}`
        : this.displayTransactionTitleForPdf(t.title);
      return base;
    }
    return `${this.kindLabelPt(t.kind)} · ${this.displayTransactionTitleForPdf(t.title)}`;
  }

  private buildExtratoDisplayBlocks(
    unitCols: UnitCol[],
    profiles: bigint[][],
  ): Array<
    | {
        kind: 'grouping';
        groupingName: string;
        unitIdentifiers: string[];
        amounts: bigint[];
        highlight: boolean;
      }
    | {
        kind: 'unit';
        unitIndex: number;
        amounts: bigint[];
        differentFromGrouping: boolean;
        highlight: boolean;
      }
  > {
    const byGroupingKey = new Map<string, number[]>();
    for (let ui = 0; ui < unitCols.length; ui++) {
      const uc = unitCols[ui]!;
      const k = groupingFeeEquivalenceKey(uc.groupingName, uc.groupingId);
      const arr = byGroupingKey.get(k) ?? [];
      arr.push(ui);
      byGroupingKey.set(k, arr);
    }

    const blocks: Array<
      | {
          kind: 'grouping';
          groupingName: string;
          unitIdentifiers: string[];
          amounts: bigint[];
          highlight: boolean;
        }
      | {
          kind: 'unit';
          unitIndex: number;
          amounts: bigint[];
          differentFromGrouping: boolean;
          highlight: boolean;
        }
    > = [];

    const sortedKeys = [...byGroupingKey.keys()].sort((a, b) => {
      const na = unitCols[byGroupingKey.get(a)![0]!]!.groupingName;
      const nb = unitCols[byGroupingKey.get(b)![0]!]!.groupingName;
      return na.localeCompare(nb, 'pt', { sensitivity: 'base' });
    });

    for (const gKey of sortedKeys) {
      const indices = byGroupingKey.get(gKey)!;
      indices.sort((a, b) =>
        unitCols[a]!.identifier.localeCompare(unitCols[b]!.identifier, 'pt', {
          sensitivity: 'base',
        }),
      );

      const bySig = new Map<string, number[]>();
      for (const ui of indices) {
        const sig = this.extratoProfileSignature(profiles[ui]!);
        const list = bySig.get(sig) ?? [];
        list.push(ui);
        bySig.set(sig, list);
      }

      let modelSig = '';
      let modelCount = -1;
      for (const [sig, list] of bySig.entries()) {
        if (list.length > modelCount) {
          modelCount = list.length;
          modelSig = sig;
        }
      }
      const modelIndices = bySig.get(modelSig) ?? indices;
      const modelAmounts = profiles[modelIndices[0]!]!;

      if (modelIndices.length === indices.length) {
        blocks.push({
          kind: 'grouping',
          groupingName: unitCols[modelIndices[0]!]!.groupingName?.trim() || '—',
          unitIdentifiers: modelIndices.map(
            (i) => unitCols[i]!.identifier.trim() || '—',
          ),
          amounts: modelAmounts,
          highlight: false,
        });
        continue;
      }

      blocks.push({
        kind: 'grouping',
        groupingName: unitCols[modelIndices[0]!]!.groupingName?.trim() || '—',
        unitIdentifiers: modelIndices.map(
          (i) => unitCols[i]!.identifier.trim() || '—',
        ),
        amounts: modelAmounts,
        highlight: false,
      });

      for (const [sig, list] of bySig.entries()) {
        if (sig === modelSig) {
          continue;
        }
        for (const ui of list) {
          blocks.push({
            kind: 'unit',
            unitIndex: ui,
            amounts: profiles[ui]!,
            differentFromGrouping: true,
            highlight: false,
          });
        }
      }
    }

    return blocks;
  }

  /**
   * Extrato de despesas e taxa: um bloco por agrupamento quando todas as unidades
   * têm o mesmo perfil; bloco individual só para unidade com valor diferente.
   */
  private renderExtratoPorAgrupamentoSection(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc: any,
    p: {
      margin: number;
      contentW: number;
      yStart: number;
      unitCols: UnitCol[];
      fixos: FinancialTransaction[];
      variavel: FinancialTransaction[];
      fundMensalidadeTxs: FinancialTransaction[];
      charges: CondominiumFeeCharge[];
      competenceYmPtBr: string;
      highlightUnitId: string | null;
    },
  ): number {
    const { margin, contentW, competenceYmPtBr, unitCols, highlightUnitId } = p;
    const accent = '#1a3a52';
    const totalColW = 88;
    const descColW = contentW - totalColW - 8;
    let y = p.yStart;

    const expenseRows = [...p.fixos, ...p.variavel];
    const fundMensalidadeRows = p.fundMensalidadeTxs;
    const fundMensalidadeIds = new Set(fundMensalidadeRows.map((t) => t.id));
    const extratoRows = [...expenseRows, ...fundMensalidadeRows];
    if (extratoRows.length === 0 && p.charges.length === 0) {
      return y;
    }

    y = this.ensureSpace(doc, y, 72, margin);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#121820');
    doc.text('Extrato por agrupamento', margin, y, { lineBreak: false });
    y += 22;
    doc.font('Helvetica').fontSize(9.5).fillColor('#1e293b');
    const intro = `Competência ${competenceYmPtBr}. Inclui despesas e aplicações do período, as mensalidades de cada fundo (obra, reserva, permanentes, etc.) e a taxa condominial devida. Cotas niveladas por agrupamento quando equivalentes. Não inclui transferências entre contas nem gastos lançados diretamente em fundos de obra/reserva. Unidades com valor diferente do padrão do agrupamento aparecem em bloco próprio.`;
    const introLines = this.wrapWordsToLines(doc, intro, contentW);
    const ilh = doc.currentLineHeight(true) + 3;
    y = this.drawTextLines(doc, margin, y, introLines, ilh, margin);
    y += 18;
    doc.fillColor('#111827');

    const chargeByUnit = new Map<string, bigint>();
    for (const c of p.charges) {
      chargeByUnit.set(c.unitId, BigInt(String(c.amountDueCents)));
    }
    const profiles = this.buildExtratoProfilesByUnitIndex(
      unitCols,
      expenseRows,
      fundMensalidadeRows,
      chargeByUnit,
    );
    let blocks = this.buildExtratoDisplayBlocks(unitCols, profiles);
    if (highlightUnitId) {
      blocks = blocks.map((b) => {
        if (b.kind === 'grouping') {
          const hit = unitCols.some(
            (u) =>
              u.unitId === highlightUnitId &&
              b.unitIdentifiers.includes(u.identifier.trim() || '—'),
          );
          return { ...b, highlight: hit };
        }
        return {
          ...b,
          highlight: unitCols[b.unitIndex]?.unitId === highlightUnitId,
        };
      });
    }

    const miniHeaderH = 26;
    const drawMiniHeader = (yy: number): number => {
      doc.lineWidth(0.4);
      doc.font('Helvetica-Bold').fontSize(8.5);
      doc.rect(margin, yy, descColW, miniHeaderH).fill('#eef2f7').stroke('#b8c4d4');
      doc.fillColor('#111827');
      doc.text('Lançamento', margin + 8, yy + 8, { lineBreak: false });
      doc.rect(margin + descColW, yy, totalColW, miniHeaderH)
        .fill('#eef2f7')
        .stroke('#b8c4d4');
      const h = 'Cota';
      doc.fillColor('#111827');
      doc.text(
        h,
        margin + descColW + totalColW - 8 - doc.widthOfString(h),
        yy + 8,
        { lineBreak: false },
      );
      return yy + miniHeaderH;
    };

    const drawAmountRows = (yy: number, amounts: bigint[]): number => {
      let cy = yy;
      for (let ri = 0; ri < extratoRows.length; ri++) {
        const t = extratoRows[ri]!;
        const part = amounts[ri] ?? 0n;
        doc.fillColor('#111827');
        doc.font('Helvetica').fontSize(8.5);
        const rowLabel = this.unitExtratoRowLabel(t, fundMensalidadeIds);
        const isFundFee = fundMensalidadeIds.has(t.id);
        const titleLines = this.wrapWordsToLines(doc, rowLabel, descColW - 14);
        const tlh = doc.currentLineHeight(true) + 1;
        const rh = Math.max(22, 8 + titleLines.length * tlh);
        cy = this.ensureSpace(doc, cy, rh + 2, margin);
        if (isFundFee) {
          doc.rect(margin, cy, descColW, rh).fill('#f8fafc').stroke('#e2e8f0');
          doc
            .rect(margin + descColW, cy, totalColW, rh)
            .fill('#f8fafc')
            .stroke('#e2e8f0');
        } else {
          doc.rect(margin, cy, descColW, rh).stroke('#e8ecf0');
          doc.rect(margin + descColW, cy, totalColW, rh).stroke('#e8ecf0');
        }
        let ty = cy + 5;
        for (const tl of titleLines) {
          doc.fillColor('#111827');
          doc.text(tl, margin + 6, ty, { lineBreak: false });
          ty += tlh;
        }
        const cell = part === 0n ? '—' : this.brl(part);
        const cellY = cy + Math.max(5, (rh - tlh) / 2);
        doc.fillColor('#0f172a');
        doc.font('Helvetica-Bold').fontSize(8.5);
        doc.text(
          cell,
          margin + descColW + totalColW - 6 - doc.widthOfString(cell),
          cellY,
          { lineBreak: false },
        );
        doc.font('Helvetica');
        cy += rh;
      }

      const taxRh = 22;
      cy = this.ensureSpace(doc, cy, taxRh + 2, margin);
      const due = amounts[extratoRows.length] ?? 0n;
      doc.rect(margin, cy, descColW, taxRh).fill('#f0f7f2').stroke('#c5ddd0');
      doc
        .rect(margin + descColW, cy, totalColW, taxRh)
        .fill('#f0f7f2')
        .stroke('#c5ddd0');
      doc.fillColor('#111827');
      doc.font('Helvetica-Bold').fontSize(8.5);
      doc.text(
        `Taxa condominial ${competenceYmPtBr} (valor devido)`,
        margin + 8,
        cy + 6,
        { lineBreak: false },
      );
      const taxS = due === 0n ? '—' : this.brl(due);
      doc.fillColor('#0f172a');
      doc.text(
        taxS,
        margin + descColW + totalColW - 6 - doc.widthOfString(taxS),
        cy + 6,
        { lineBreak: false },
      );
      doc.font('Helvetica');
      return cy + taxRh + 20;
    };

    for (const block of blocks) {
      if (block.kind === 'grouping') {
        const unitsLabel =
          block.unitIdentifiers.length <= 6
            ? block.unitIdentifiers.join(', ')
            : `${block.unitIdentifiers.length} unidades (${block.unitIdentifiers.slice(0, 4).join(', ')}…)`;
        const subLines = this.wrapWordsToLines(
          doc,
          `Unidades: ${unitsLabel}`,
          contentW - 24,
        );
        const subLh = doc.currentLineHeight(true) + 1.5;
        const blockTopH = 36 + subLines.length * subLh + 8;
        y = this.ensureSpace(doc, y, blockTopH + 48, margin);
        const fill = block.highlight ? '#eff6ff' : '#f4f7fb';
        const stroke = block.highlight ? '#93c5fd' : '#d8e0ea';
        doc.save();
        doc
          .roundedRect(margin, y - 2, contentW, blockTopH - 2, 4)
          .fill(fill)
          .stroke(stroke);
        doc.restore();
        let cy = y + 6;
        doc.font('Helvetica-Bold').fontSize(11).fillColor(accent);
        doc.text(`Agrupamento ${block.groupingName}`, margin + 10, cy, {
          lineBreak: false,
        });
        cy += 18;
        doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
        for (const sl of subLines) {
          doc.text(sl, margin + 10, cy, { lineBreak: false });
          cy += subLh;
        }
        doc.fillColor('#111827');
        y += blockTopH + 8;
        y = drawMiniHeader(y);
        y = drawAmountRows(y, block.amounts);
        continue;
      }

      const uc = unitCols[block.unitIndex]!;
      const respRaw = uc.responsibleName?.trim() ?? '';
      doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
      const respLines = respRaw.length
        ? this.wrapWordsToLines(
            doc,
            `Responsável: ${respRaw}`,
            contentW - 24,
          )
        : [];
      const noteLines = block.differentFromGrouping
        ? this.wrapWordsToLines(
            doc,
            'Valor diferente do padrão do agrupamento nesta competência.',
            contentW - 24,
          )
        : [];
      const respLh = doc.currentLineHeight(true) + 1.5;
      const extraH =
        (respLines.length + noteLines.length) * respLh +
        (noteLines.length > 0 ? 4 : 0);
      const blockTopH = 40 + extraH + 8;
      y = this.ensureSpace(doc, y, blockTopH + 48, margin);
      const fill = block.highlight ? '#eff6ff' : '#f4f7fb';
      const stroke = block.highlight ? '#93c5fd' : '#d8e0ea';
      doc.save();
      doc
        .roundedRect(margin, y - 2, contentW, blockTopH - 2, 4)
        .fill(fill)
        .stroke(stroke);
      doc.restore();
      let cy = y + 6;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(accent);
      doc.text(`Unidade ${uc.identifier}`, margin + 10, cy, {
        lineBreak: false,
      });
      cy += 18;
      doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
      doc.text(`Agrupamento: ${uc.groupingName?.trim() || '—'}`, margin + 10, cy, {
        lineBreak: false,
      });
      cy += 16;
      for (const nl of noteLines) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#64748b');
        doc.text(nl, margin + 10, cy, { lineBreak: false });
        cy += respLh;
      }
      doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
      for (const rl of respLines) {
        doc.text(rl, margin + 10, cy, { lineBreak: false });
        cy += respLh;
      }
      doc.fillColor('#111827');
      y += blockTopH + 8;
      y = drawMiniHeader(y);
      y = drawAmountRows(y, block.amounts);
    }

    return y;
  }

  private brl(cents: bigint): string {
    const n = Number(cents) / 100;
    if (!Number.isFinite(n)) {
      return '—';
    }
    const s = n.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R$ ${s}`;
  }

  /** Saldo de fundo no PDF: sempre positivo (módulo), alinhado ao painel. */
  private brlAbs(cents: bigint): string {
    const v = cents < 0n ? -cents : cents;
    return this.brl(v);
  }

  /** Saldo com sinal (negativo quando o fundo está deficitário). Usa hífen ASCII: Helvetica do PDF não desenha U+2212. */
  private brlSigned(cents: bigint): string {
    if (cents < 0n) {
      return `- ${this.brl(-cents)}`;
    }
    return this.brl(cents);
  }
}
