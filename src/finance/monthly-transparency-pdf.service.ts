import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import QRCode from 'qrcode';
import { Between, In, Repository } from 'typeorm';
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
import { formatDateOnlyYmdUtc, parseDateOnlyFromApi } from './date-only.util';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
import { FinancialFund } from './entities/financial-fund.entity';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import {
  firstDayOfCompetenceYm,
  isValidCompetenceYm,
  lastDayOfCompetenceYm,
} from './finance-competence.util';
import { isAllocationRule } from './allocation.types';
import { distributePositiveCents } from './distribute-cents';
import { groupingFeeEquivalenceKey } from './fee-equivalence.util';
import { FundBalanceService } from './fund-balance.service';
import {
  buildPixBrCode,
  sanitizePixKey,
  sanitizePixMessage,
} from './pix-br-code.util';

type UnitCol = {
  unitId: string;
  identifier: string;
  groupingName: string;
  groupingId: string;
  /** Responsável identificado (ficha) ou rótulo livre na unidade. */
  responsibleName: string | null;
};

type FundPdfRow = {
  id: string;
  name: string;
  allocationSummary: string;
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
    @InjectRepository(Grouping)
    private readonly groupingRepo: Repository<Grouping>,
    @InjectRepository(CondominiumParticipant)
    private readonly participantRepo: Repository<CondominiumParticipant>,
    private readonly condominiumsService: CondominiumsService,
    private readonly governance: GovernanceService,
    private readonly fundBalance: FundBalanceService,
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
    if (targetUnitId) {
      await this.assertUnitAccess(condominiumId, userId, targetUnitId);
    } else {
      await this.governance.assertManagement(condominiumId, userId);
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
    const unitCols = targetUnitId
      ? allUnitCols.filter((u) => u.unitId === targetUnitId)
      : allUnitCols;
    if (targetUnitId && unitCols.length === 0) {
      throw new NotFoundException('Unit not found in condominium');
    }

    const periodTransactions = await this.txRepo.find({
      where: {
        condominiumId,
        kind: In(['expense', 'investment', 'income']),
        occurredOn: Between(from, to),
      },
      relations: { fund: true, unitShares: true },
      order: { occurredOn: 'ASC', id: 'ASC' },
    });
    const txs = periodTransactions.filter((t) => t.kind !== 'income');

    const charges = await this.chargeRepo.find({
      where: { condominiumId, competenceYm: ym },
      relations: { unit: { grouping: true } },
    });
    charges.sort((a, b) =>
      (a.unit?.identifier ?? '').localeCompare(b.unit?.identifier ?? '', 'pt'),
    );
    const unitCharge = targetUnitId
      ? (charges.find((c) => c.unitId === targetUnitId) ?? null)
      : null;

    const syndicWhatsapp =
      await this.condominiumsService.resolveSyndicWhatsappDisplay(
        condominiumId,
      );

    const fixos = txs.filter((t) => t.fund?.isPermanent === true);
    const variavel = txs.filter((t) => t.fund?.isPermanent !== true);

    const pixKey = sanitizePixKey(condo.billingPixKey);
    let pixPayload: string | null = null;
    let pixQrPng: Buffer | null = null;
    const includePixBrCodeOnPdf =
      condo.transparencyPdfIncludePixQrCode !== false;
    if (pixKey && includePixBrCodeOnPdf) {
      // Mês/ano compacto e sem separadores (BR Code rejeita `-` e `/` em
      // vários PSPs no campo 26.02). Ex.: "202603".
      const ymCompact = ym.replace(/[^0-9]/g, '');
      const perUnitAmountCents =
        targetUnitId && unitCharge
          ? BigInt(String(unitCharge.amountDueCents))
          : null;
      const qrValue =
        perUnitAmountCents !== null
          ? Number(perUnitAmountCents) / 100
          : undefined;
      // Mensagem só com letras/números/espaço; limitada a 25 caracteres
      // (compatibilidade ampla com Itaú, Nubank, Inter, Bradesco etc.).
      // Priorizamos o AAAAMM no final; o nome do condomínio é encurtado
      // para caber no espaço restante, garantindo que a referência
      // «quando é relativa a qual mês» nunca desapareça.
      const msgMaxLen = 25;
      const msgTail = ymCompact ? ` ${ymCompact}` : '';
      const msgHead = targetUnitId
        ? sanitizePixMessage(condo.name ?? '', msgMaxLen - msgTail.length)
        : 'Taxa';
      const qrMessage =
        sanitizePixMessage(`${msgHead}${msgTail}`, msgMaxLen) || 'Pix';
      try {
        pixPayload = buildPixBrCode({
          key: pixKey,
          name: condo.billingPixBeneficiaryName?.trim() || condo.name || '',
          city: condo.billingPixCity?.trim() || 'NAO INFORMADO',
          amount: qrValue,
          message: qrMessage,
        });
        pixQrPng = await QRCode.toBuffer(pixPayload, {
          type: 'png',
          width: 320,
          margin: 1,
        });
      } catch {
        // Campos PIX inválidos (nome/cidade vazios após sanitização etc.).
        // Seguimos sem BR Code em vez de produzir um código corrompido.
        pixPayload = null;
        pixQrPng = null;
      }
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

    const fundReport =
      await this.fundBalance.fundBalancesForCompetenceReport(condominiumId, ym);
    const funds = await this.fundRepo.find({
      where: { condominiumId },
      order: { name: 'ASC' },
    });
    const groupings = await this.groupingRepo.find({
      where: { condominiumId },
      order: { name: 'ASC' },
    });
    const groupingNameById = new Map(
      groupings.map((g) => [g.id, g.name.trim() || '—']),
    );
    const allUnitsForAlloc = await this.unitRepo.find({
      where: { grouping: { condominiumId } },
      relations: {
        grouping: true,
        ownerPerson: true,
        responsibleLinks: { person: true },
      },
    });
    const unitById = new Map(allUnitsForAlloc.map((u) => [u.id, u]));

    const unitsByGroupingId = new Map<string, Unit[]>();
    for (const u of allUnitsForAlloc) {
      const list = unitsByGroupingId.get(u.groupingId) ?? [];
      list.push(u);
      unitsByGroupingId.set(u.groupingId, list);
    }
    for (const list of unitsByGroupingId.values()) {
      list.sort((a, b) =>
        a.identifier.localeCompare(b.identifier, 'pt', { sensitivity: 'base' }),
      );
    }
    const agrupamentosDisplay: AgrupamentosPdfRow[] = groupings.map((g) => {
      const units = unitsByGroupingId.get(g.id) ?? [];
      const gname = g.name.trim() || '—';
      return {
        groupingName: gname,
        unitLines: units.map((u) => {
          const id = u.identifier.trim() || '—';
          const owner =
            u.ownerPerson?.fullName?.trim() ||
            u.ownerDisplayName?.trim() ||
            null;
          const respNames = (u.responsibleLinks ?? [])
            .map((l) => l.person?.fullName?.trim())
            .filter((x): x is string => !!x);
          const resp =
            (respNames.length ? respNames.join(', ') : null) ||
            u.responsibleDisplayName?.trim() ||
            '—';
          const parts = [id];
          if (owner) {
            parts.push(`Proprietário: ${owner}`);
          }
          parts.push(`Responsável: ${resp}`);
          return parts.join(' — ');
        }),
      };
    });

    const fundRows: FundPdfRow[] = funds.map((f) => ({
      id: f.id,
      name: f.name,
      allocationSummary: this.describeFundAllocation(
        f,
        groupingNameById,
        unitById,
        allUnitsForAlloc,
      ),
    }));

    const administracaoDisplay =
      await this.loadAdministracaoForPdf(condominiumId);

    const targetUnit = targetUnitId ? unitCols[0] ?? null : null;
    return this.renderPdf({
      condoName: condo.name,
      competenceYm: ym,
      periodLabel: this.formatExpensePeriodLabelPtBr(fromStr, toStr),
      unitCols,
      fixos,
      variavel,
      periodTransactions,
      charges,
      syndicWhatsapp,
      pixPayload,
      pixQrPng,
      pixKey: pixKey || null,
      pixBeneficiaryLabel:
        condo.billingPixBeneficiaryName?.trim() || condo.name?.trim() || null,
      pixCity: condo.billingPixCity?.trim() || null,
      managementLogoBuffer,
      funds: fundRows,
      fundReport,
      agrupamentosDisplay,
      administracao: administracaoDisplay,
      targetUnit,
      unitCharge,
    });
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
      relations: { grouping: true, responsibleLinks: { person: true } },
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
      const fromLinks = (u.responsibleLinks ?? [])
        .map((l) => l.person?.fullName?.trim())
        .filter((x): x is string => !!x);
      const responsibleName =
        (fromLinks.length ? fromLinks.join(', ') : null) ||
        u.responsibleDisplayName?.trim() ||
        null;
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

  /** Texto sem espaços (ex.: payload PIX): quebra por tamanho fixo. */
  private chunkFixedChars(s: string, len: number): string[] {
    const t = String(s);
    const out: string[] = [];
    for (let i = 0; i < t.length; i += len) {
      out.push(t.slice(i, i + len));
    }
    return out;
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

  /** Saldos inicial e final da competência: soma dos lançamentos com `fund_id` até cada data. */
  private renderFundBalancesTable(
    doc: InstanceType<typeof PDFDocument>,
    funds: FundPdfRow[],
    fundReport: {
      openingYmd: string;
      closingYmd: string;
      openingByFund: Map<string, bigint>;
      closingByFund: Map<string, bigint>;
    },
    margin: number,
    contentW: number,
    yStart: number,
  ): number {
    const accent = '#1a3a52';
    const colNumW = 108;
    const colFundW = contentW - colNumW * 2 - 24;
    const colOpenX = margin + colFundW + 8;
    const colCloseX = colOpenX + colNumW + 8;
    let y = yStart;
    y = this.ensureSpace(doc, y, 80, margin);

    doc.font('Helvetica-Bold').fontSize(15).fillColor('#121820');
    doc.text('Saldos dos fundos', margin, y, { lineBreak: false });
    y += 24;
    doc.font('Helvetica').fontSize(9).fillColor('#5a6572');
    const openPt = this.formatYmdPtBr(fundReport.openingYmd);
    const closePt = this.formatYmdPtBr(fundReport.closingYmd);
    const sub = `Saldo período anterior em ${openPt} (fim do mês anterior à competência) e saldo em ${closePt} (fim desta competência). Valores obtidos pela soma dos lançamentos associados a cada fundo até essas datas (receitas somam; despesas e aplicações subtraem). Os montantes na tabela são apresentados em valor absoluto (sem sinal negativo).`;
    const subLines = this.wrapWordsToLines(doc, sub, contentW);
    const slh = doc.currentLineHeight(true) + 3.5;
    y = this.drawTextLines(doc, margin, y, subLines, slh, margin);
    y += 16;

    if (funds.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#888888');
      doc.text('Nenhum fundo cadastrado.', margin, y, { lineBreak: false });
      return y + 24;
    }

    const headH = 48;
    y = this.ensureSpace(doc, y, headH + 6, margin);
    doc.save();
    doc
      .rect(margin, y, contentW, headH)
      .fill('#e8edf4')
      .strokeColor('#b8c4d4')
      .lineWidth(0.55)
      .stroke();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(accent);
    doc.text('Fundo / rateio', margin + 10, y + 10, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(accent);
    const h0 = 'Saldo período anterior';
    doc.text(h0, colOpenX + colNumW - 6 - doc.widthOfString(h0), y + 8, {
      lineBreak: false,
    });
    const h1 = 'Saldo na competência';
    doc.text(h1, colCloseX + colNumW - 6 - doc.widthOfString(h1), y + 8, {
      lineBreak: false,
    });
    doc.font('Helvetica').fontSize(7).fillColor('#5a6572');
    doc.text(`(${openPt})`, colOpenX + colNumW - 6 - doc.widthOfString(`(${openPt})`), y + 24, {
      lineBreak: false,
    });
    doc.text(`(${closePt})`, colCloseX + colNumW - 6 - doc.widthOfString(`(${closePt})`), y + 24, {
      lineBreak: false,
    });
    y += headH;

    let idx = 0;
    for (const f of funds) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#5a6572');
      const allocLines = this.wrapWordsToLines(
        doc,
        f.allocationSummary,
        colFundW - 16,
      );
      const allocLineH = doc.currentLineHeight(true) + 2;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#222222');
      const nameLineH = doc.currentLineHeight(true) + 2;
      const rowH = Math.max(44, 14 + nameLineH + allocLines.length * allocLineH + 12);

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
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#222222');
      doc.text(f.name.trim() || '—', margin + 10, ty, { lineBreak: false });
      ty += nameLineH;
      doc.font('Helvetica').fontSize(8.5).fillColor('#5a6572');
      for (const al of allocLines) {
        doc.text(al, margin + 10, ty, { lineBreak: false });
        ty += allocLineH;
      }

      const o = fundReport.openingByFund.get(f.id) ?? 0n;
      const c = fundReport.closingByFund.get(f.id) ?? 0n;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0d1b26');
      const amtY = y + Math.max(10, (rowH - 22) / 2);
      const os = this.brlAbs(o);
      doc.text(os, colOpenX + colNumW - 6 - doc.widthOfString(os), amtY, {
        lineBreak: false,
      });
      const cs = this.brlAbs(c);
      doc.text(cs, colCloseX + colNumW - 6 - doc.widthOfString(cs), amtY, {
        lineBreak: false,
      });
      y += rowH;
      idx += 1;
    }

    return y + 12;
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

  /** Ex.: `2026-03` → `03/2026` (para referência curta em QR/mensagens). */
  private formatCompetenceYmSlash(ym: string): string {
    const head = ym.trim();
    const m = /^(\d{4})-(\d{2})$/.exec(head);
    if (!m) {
      return head;
    }
    return `${m[2]}/${m[1]}`;
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

  /**
   * Página 1 — slip de pagamento para a unidade informada: traz o valor devido
   * em destaque, chave PIX, QR Code (com valor pré-preenchido) e código
   * «Copia e cola». Pensado para o condômino quitar direto no app do banco.
   */
  private renderUnitPaymentSlipPage(
    doc: InstanceType<typeof PDFDocument>,
    p: {
      margin: number;
      contentW: number;
      accent: string;
      muted: string;
      condoName: string;
      competenceYm: string;
      competenceYmPtBr: string;
      unit: UnitCol;
      charge: CondominiumFeeCharge | null;
      pixKey: string | null;
      pixBeneficiaryLabel: string | null;
      pixCity: string | null;
      pixQrPng: Buffer | null;
      pixPayload: string | null;
      syndicWhatsapp: string | null;
      managementLogoBuffer: Buffer | null;
    },
  ): void {
    const {
      margin,
      contentW,
      accent,
      muted,
      condoName,
      competenceYmPtBr,
      unit,
      charge,
    } = p;
    const amountCents = charge ? BigInt(String(charge.amountDueCents)) : 0n;
    const amountStr = this.brl(amountCents);
    const dueOnPt = charge ? this.formatDateBr(charge.dueOn) : '—';

    let y = margin;
    y = drawDocumentHeaderLogo(doc, margin, y, p.managementLogoBuffer, 48);

    doc.save();
    doc.rect(margin, y, 4, 64).fill(accent);
    doc.restore();
    doc
      .font('Helvetica-Bold')
      .fontSize(19)
      .fillColor('#121820')
      .text('Pagamento da taxa condominial', margin + 14, y + 2, {
        lineBreak: false,
      });
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(muted)
      .text('Slip de pagamento via PIX — específico para a unidade', margin + 14, y + 30, {
        lineBreak: false,
      });
    y += 78;

    doc.save();
    doc
      .roundedRect(margin, y, contentW, 132, 8)
      .fill('#f4f7fb')
      .strokeColor('#d8e0ea')
      .lineWidth(0.6)
      .stroke();
    doc.restore();
    const boxInset = 16;
    const colW = (contentW - boxInset * 2 - 20) / 2;
    const leftX = margin + boxInset;
    const rightX = leftX + colW + 20;

    doc.font('Helvetica').fontSize(8.5).fillColor(muted);
    doc.text('CONDOMÍNIO', leftX, y + 14, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0d1b26');
    const condoLines = this.wrapWordsToLines(doc, condoName, colW);
    let ly = y + 26;
    const condoLh = doc.currentLineHeight(true) + 1;
    for (const cl of condoLines.slice(0, 2)) {
      doc.text(cl, leftX, ly, { lineBreak: false });
      ly += condoLh;
    }

    const respLine = unit.responsibleName?.trim();
    doc.font('Helvetica').fontSize(8.5).fillColor(muted);
    doc.text('UNIDADE', leftX, y + 72, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0d1b26');
    const unitLabel = `${unit.identifier}${unit.groupingName ? ` · ${unit.groupingName}` : ''}`;
    doc.text(unitLabel, leftX, y + 84, { lineBreak: false });
    if (respLine) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      const respLines = this.wrapWordsToLines(
        doc,
        `Responsável: ${respLine}`,
        colW,
      );
      if (respLines[0]) {
        doc.text(respLines[0], leftX, y + 102, { lineBreak: false });
      }
    }

    doc.font('Helvetica').fontSize(8.5).fillColor(muted);
    doc.text('COMPETÊNCIA', rightX, y + 14, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0d1b26');
    doc.text(competenceYmPtBr, rightX, y + 26, { lineBreak: false });

    doc.font('Helvetica').fontSize(8.5).fillColor(muted);
    doc.text('VENCIMENTO', rightX, y + 56, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0d1b26');
    doc.text(dueOnPt, rightX, y + 68, { lineBreak: false });

    doc.font('Helvetica').fontSize(8.5).fillColor(muted);
    doc.text('SITUAÇÃO', rightX, y + 96, { lineBreak: false });
    const statusLabel = !charge
      ? 'Sem cobrança gerada'
      : charge.status === 'paid'
        ? 'Paga'
        : 'Em aberto';
    doc.font('Helvetica-Bold').fontSize(12).fillColor(
      !charge ? '#b91c1c' : charge.status === 'paid' ? '#166534' : '#92400e',
    );
    doc.text(statusLabel, rightX, y + 108, { lineBreak: false });

    y += 132 + 16;

    doc.save();
    doc
      .roundedRect(margin, y, contentW, 72, 10)
      .fill('#0f172a')
      .strokeColor('#0f172a')
      .lineWidth(0.5)
      .stroke();
    doc.restore();
    doc.font('Helvetica').fontSize(9).fillColor('#cbd5e1');
    doc.text('VALOR A PAGAR', margin + 18, y + 16, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(28).fillColor('#ffffff');
    doc.text(amountStr, margin + 18, y + 30, { lineBreak: false });
    doc.font('Helvetica').fontSize(8.5).fillColor('#93a1b4');
    const refText = `Referência: ${condoName} - ${this.formatCompetenceYmSlash(p.competenceYm)}`;
    const refDisplay = this.wrapWordsToLines(doc, refText, contentW - 36)[0] ?? refText;
    doc.text(refDisplay, margin + 18, y + 60, { lineBreak: false });
    y += 72 + 18;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(accent);
    doc.text('Pague via PIX', margin, y, { lineBreak: false });
    y += 18;

    if (p.pixQrPng && p.pixPayload) {
      const qrSize = 180;
      const qrX = margin;
      const qrY = y;
      doc.save();
      doc
        .roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 6)
        .fill('#ffffff')
        .strokeColor('#d8e0ea')
        .lineWidth(0.55)
        .stroke();
      doc.restore();
      doc.image(p.pixQrPng, qrX, qrY, { width: qrSize });

      const infoX = qrX + qrSize + 22;
      const infoW = contentW - qrSize - 22;
      let iy = qrY + 2;
      doc.font('Helvetica').fontSize(8.5).fillColor(muted);
      doc.text('BENEFICIÁRIO', infoX, iy, { lineBreak: false });
      iy += 12;
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#0d1b26');
      const benLines = this.wrapWordsToLines(
        doc,
        p.pixBeneficiaryLabel ?? condoName,
        infoW,
      );
      const benLh = doc.currentLineHeight(true) + 1;
      for (const bl of benLines.slice(0, 2)) {
        doc.text(bl, infoX, iy, { lineBreak: false });
        iy += benLh;
      }
      iy += 6;

      if (p.pixKey) {
        doc.font('Helvetica').fontSize(8.5).fillColor(muted);
        doc.text('CHAVE PIX', infoX, iy, { lineBreak: false });
        iy += 12;
        doc.font('Courier').fontSize(10).fillColor('#111827');
        const keyLines = this.wrapWordsToLines(doc, p.pixKey, infoW);
        const keyLh = doc.currentLineHeight(true) + 1;
        for (const kl of keyLines.slice(0, 3)) {
          doc.text(kl, infoX, iy, { lineBreak: false });
          iy += keyLh;
        }
        iy += 6;
      }

      doc.font('Helvetica').fontSize(8.5).fillColor(muted);
      doc.text('COMO PAGAR', infoX, iy, { lineBreak: false });
      iy += 12;
      doc.font('Helvetica').fontSize(8.5).fillColor('#1e293b');
      const howLines = this.wrapWordsToLines(
        doc,
        'Abra o app do seu banco, escolha PIX → QR Code ou PIX Copia e cola, aponte a câmera para o código ao lado ou cole o código abaixo. Confira o nome do beneficiário e confirme a transferência.',
        infoW,
      );
      const howLh = doc.currentLineHeight(true) + 1.5;
      for (const hl of howLines) {
        doc.text(hl, infoX, iy, { lineBreak: false });
        iy += howLh;
      }

      y = qrY + qrSize + 18;

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(accent);
      doc.text('PIX Copia e cola', margin, y, { lineBreak: false });
      y += 14;
      // Uma única chamada `doc.text()` com `\n` explícito entre os
      // chunks: o content stream do PDF fica com um texto contínuo, e
      // ao copiar aparecem só quebras de linha entre os trechos (sem
      // espaços intrusivos). Apps de banco toleram `\n` no BR Code.
      doc.font('Courier').fontSize(7).fillColor('#111827');
      const copyColW = contentW - 20;
      const copyBoxH = 78;
      doc.save();
      doc
        .roundedRect(margin, y - 4, contentW, copyBoxH, 4)
        .fill('#f8fafc')
        .strokeColor('#d8e0ea')
        .lineWidth(0.45)
        .stroke();
      doc.restore();
      const perLineCopy = Math.max(
        10,
        Math.floor(copyColW / Math.max(1, doc.widthOfString('M'))),
      );
      doc.text(
        this.chunkFixedChars(p.pixPayload, perLineCopy).join('\n'),
        margin + 10,
        y,
        {
          width: copyColW,
          lineBreak: true,
          lineGap: 1,
        },
      );
      y = Math.max(y + copyBoxH, doc.y) + 10;
    } else if (p.pixKey) {
      doc.font('Helvetica').fontSize(9.5).fillColor('#334155');
      const lines = this.wrapWordsToLines(
        doc,
        'No app do seu banco, informe manualmente a chave PIX abaixo e o valor devido. Confira o nome do beneficiário antes de confirmar.',
        contentW,
      );
      const lh = doc.currentLineHeight(true) + 2;
      for (const ln of lines) {
        doc.text(ln, margin, y, { lineBreak: false });
        y += lh;
      }
      y += 4;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(muted);
      doc.text('CHAVE PIX', margin, y, { lineBreak: false });
      y += 12;
      doc.font('Courier').fontSize(10).fillColor('#111827');
      const keyLines = this.wrapWordsToLines(doc, p.pixKey, contentW);
      const keyLh = doc.currentLineHeight(true) + 1;
      for (const kl of keyLines) {
        doc.text(kl, margin, y, { lineBreak: false });
        y += keyLh;
      }
      y += 8;
    } else {
      doc.font('Helvetica').fontSize(9.5).fillColor('#b91c1c');
      const warn = this.wrapWordsToLines(
        doc,
        'Chave PIX ainda não configurada neste condomínio. Peça ao síndico para cadastrar a chave em «Editar condomínio → Cobrança».',
        contentW,
      );
      const wlh = doc.currentLineHeight(true) + 2;
      for (const wl of warn) {
        doc.text(wl, margin, y, { lineBreak: false });
        y += wlh;
      }
      y += 8;
    }

    if (p.syndicWhatsapp) {
      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      const compLines = this.wrapWordsToLines(
        doc,
        `Após efetuar o pagamento, envie o comprovante (print ou PDF) para o WhatsApp do síndico: ${p.syndicWhatsapp}.`,
        contentW,
      );
      const clh = doc.currentLineHeight(true) + 2;
      for (const cl of compLines) {
        doc.text(cl, margin, y, { lineBreak: false });
        y += clh;
      }
    }
  }

  private renderPdf(ctx: {
    condoName: string;
    competenceYm: string;
    periodLabel: string;
    unitCols: UnitCol[];
    fixos: FinancialTransaction[];
    variavel: FinancialTransaction[];
    periodTransactions: FinancialTransaction[];
    charges: CondominiumFeeCharge[];
    syndicWhatsapp: string | null;
    pixPayload: string | null;
    pixQrPng: Buffer | null;
    /** Chave PIX legível (e-mail, telefone, EVP, etc.) — aparece nas instruções. */
    pixKey: string | null;
    pixBeneficiaryLabel: string | null;
    pixCity: string | null;
    managementLogoBuffer: Buffer | null;
    funds: FundPdfRow[];
    agrupamentosDisplay: AgrupamentosPdfRow[];
    administracao: AdministracaoPdf;
    fundReport: {
      openingYmd: string;
      closingYmd: string;
      openingByFund: Map<string, bigint>;
      closingByFund: Map<string, bigint>;
    };
    /** Quando informado, a primeira página é o slip de pagamento da unidade. */
    targetUnit: UnitCol | null;
    unitCharge: CondominiumFeeCharge | null;
  }): Promise<Buffer> {
    const margin = 56;
    /** Faixa inferior para rodapé (logo meucondominio.cloud à direita + linha). */
    const footerReserve = 102;
    const unitCols = ctx.unitCols;
    const accent = '#1a3a52';
    const muted = '#5a6572';

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

      const competenceYmPtBr = this.formatCompetenceYmPtBr(ctx.competenceYm);

      const pageW = doc.page.width;
      const contentW = pageW - margin * 2;
      const readabilityW = Math.max(320, contentW - 140);
      /** Resumo geral: só 2 colunas (cabe em retrato com qualquer N de unidades). */
      const sumTotalW = 92;
      const sumDescW = contentW - sumTotalW - 10;
      const rowH = 20;
      const headerH = 46;

      let y = margin;

      if (ctx.targetUnit) {
        this.renderUnitPaymentSlipPage(doc, {
          margin,
          contentW,
          accent,
          muted,
          condoName: ctx.condoName,
          competenceYm: ctx.competenceYm,
          competenceYmPtBr,
          unit: ctx.targetUnit,
          charge: ctx.unitCharge,
          pixKey: ctx.pixKey,
          pixBeneficiaryLabel: ctx.pixBeneficiaryLabel,
          pixCity: ctx.pixCity,
          pixQrPng: ctx.pixQrPng,
          pixPayload: ctx.pixPayload,
          syndicWhatsapp: ctx.syndicWhatsapp,
          managementLogoBuffer: ctx.managementLogoBuffer,
        });
        doc.addPage();
        doc.x = margin;
        doc.y = margin;
        y = margin;
      }

      y = drawDocumentHeaderLogo(
        doc,
        margin,
        y,
        ctx.managementLogoBuffer,
        48,
      );

      doc.save();
      doc.rect(margin, y, 4, 58).fill(accent);
      doc.restore();
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor('#121820')
        .text(
          ctx.targetUnit ? 'Prestação de contas do mês' : 'Prestação de contas',
          margin + 14,
          y + 2,
          { lineBreak: false },
        );
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(muted)
        .text(
          ctx.targetUnit
            ? `Detalhamento da taxa — unidade ${ctx.targetUnit.identifier}`
            : 'Taxa condominial — transparência',
          margin + 14,
          y + 32,
          {
            lineBreak: false,
          },
        );
      y += 68;

      doc.font('Helvetica-Bold').fontSize(14).fillColor('#121820');
      doc.text('Identificação do condomínio', margin, y, {
        lineBreak: false,
      });
      y += 22;
      doc.fillColor('#000000');

      doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a1a');
      doc.text(ctx.condoName, margin, y, { lineBreak: false });
      y += 22;
      doc.font('Helvetica').fontSize(10.5).fillColor(muted);
      doc.text(`Competência ${competenceYmPtBr}`, margin, y, { lineBreak: false });
      y += 18;
      doc.text(`Período das despesas: ${ctx.periodLabel}`, margin, y, {
        lineBreak: false,
      });
      y += 24;
      doc.save();
      doc.strokeColor('#d4dbe3').lineWidth(0.9);
      doc.moveTo(margin, y).lineTo(margin + contentW, y).stroke();
      doc.restore();
      y += 20;
      doc.fillColor('#000000');

      y = this.renderAdministracaoSection(
        doc,
        ctx.administracao,
        margin,
        contentW,
        y,
      );
      y += 10;

      y = this.renderAgrupamentosConfiguredSection(
        doc,
        ctx.agrupamentosDisplay,
        margin,
        contentW,
        y,
      );
      y += 10;

      y = this.renderFundsAgrupamentosSection(
        doc,
        ctx.funds,
        margin,
        contentW,
        y,
      );
      y += 12;

      const startNewSectionPage = (): number => {
        doc.addPage();
        doc.x = margin;
        doc.y = margin;
        return margin;
      };

      y = startNewSectionPage();
      doc.font('Helvetica-Bold').fontSize(14).fillColor(accent);
      doc.text('Despesas e saídas', margin, y, { lineBreak: false });
      y += 22;
      doc.fillColor('#000000');

      const drawSummaryTableHeader = (yy: number): number => {
        let x = margin;
        doc.font('Helvetica-Bold').fontSize(8.5);
        doc.lineWidth(0.4);
        doc.rect(x, yy, sumDescW, headerH).fill('#eef2f7').stroke('#b8c4d4');
        doc.fillColor('#1a1a1a');
        doc.text('Descritivo', x + 8, yy + 10, { lineBreak: false });
        x += sumDescW;
        doc.rect(x, yy, sumTotalW, headerH).fill('#eef2f7').stroke('#b8c4d4');
        doc.fillColor('#1a1a1a');
        const totalLbl = 'Total';
        doc.text(
          totalLbl,
          x + sumTotalW - 8 - doc.widthOfString(totalLbl),
          yy + 16,
          { lineBreak: false },
        );
        return yy + headerH;
      };

      const drawSection = (
        title: string,
        rows: FinancialTransaction[],
        startY: number,
      ): { y: number; sumTotal: bigint } => {
        let cy = startY;
        cy = this.ensureSpace(doc, cy, rowH + 28, margin);
        doc.font('Helvetica-Bold').fontSize(11.5).fillColor(accent);
        doc.text(title, margin, cy, { lineBreak: false });
        cy += 22;
        cy = drawSummaryTableHeader(cy);
        let sumTotal = 0n;
        for (const t of rows) {
          cy = this.ensureSpace(doc, cy, rowH + 2, margin);
          const { declared } = this.expenseRowAmountsForUnitTable(t, unitCols);
          sumTotal += declared;
          cy = this.drawSummaryTwoColumnRow(
            doc,
            margin,
            cy,
            rowH,
            sumDescW,
            sumTotalW,
            this.displayTransactionTitleForPdf(t.title).slice(0, 200),
            declared,
          );
        }
        if (rows.length === 0) {
          cy = this.ensureSpace(doc, cy, rowH + 2, margin);
          doc.font('Helvetica').fontSize(9).fillColor('#6b7280');
          doc.text('Sem lançamentos nesta categoria.', margin + 6, cy, {
            lineBreak: false,
          });
          cy += rowH;
          doc.fillColor('#000000');
        }
        return { y: cy + 18, sumTotal };
      };

      const rFix = drawSection(
        'Despesas fixas (fundos permanentes)',
        ctx.fixos,
        y,
      );
      y = rFix.y;
      const rVar = drawSection(
        'Demais despesas (variáveis e fundos em prestações)',
        ctx.variavel,
        y,
      );
      y = rVar.y;

      const grand = rFix.sumTotal + rVar.sumTotal;
      y = this.ensureSpace(doc, y, rowH + 16, margin);
      doc.save();
      doc
        .roundedRect(margin, y - 4, contentW, rowH + 18, 4)
        .fill('#f0f4f9')
        .strokeColor('#c5d3e3')
        .lineWidth(0.5)
        .stroke();
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0d1b26');
      const subLbl = `Subtotal despesas no período: ${this.brl(grand)}`;
      doc.text(subLbl, margin + 12, y + 6, { lineBreak: false });
      y += rowH + 24;

      y = startNewSectionPage();
      doc.font('Helvetica-Bold').fontSize(14).fillColor(accent);
      doc.text('Fundos e receitas', margin, y, { lineBreak: false });
      y += 24;
      doc.fillColor('#000000');

      y = this.renderFundBalancesTable(
        doc,
        ctx.funds,
        ctx.fundReport,
        margin,
        contentW,
        y,
      );

      y += 24;
      y = this.renderCashFlowDetailed(
        doc,
        ctx.periodTransactions,
        ctx.periodLabel,
        ctx.charges,
        competenceYmPtBr,
        margin,
        contentW,
        y,
      );

      y = startNewSectionPage();
      y = this.renderUnitExtratoMensalSection(
        doc,
        margin,
        contentW,
        y,
        unitCols,
        ctx.fixos,
        ctx.variavel,
        ctx.charges,
        competenceYmPtBr,
      );

      if (!ctx.targetUnit) {
      y = startNewSectionPage();
      doc.font('Helvetica-Bold').fontSize(14).fillColor(accent);
      doc.text('Taxa condominial e pagamento', margin, y, {
        lineBreak: false,
      });
      y += 22;
      doc.fillColor('#000000');

      y = this.ensureSpace(doc, y, rowH + 32, margin);
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(accent);
      doc.text('Taxa condominial (valor por unidade)', margin, y, {
        lineBreak: false,
      });
      y += 22;
      y = drawSummaryTableHeader(y);
      const chargeByUnit = new Map<string, bigint>();
      for (const c of ctx.charges) {
        chargeByUnit.set(c.unitId, BigInt(String(c.amountDueCents)));
      }
      y = this.ensureSpace(doc, y, rowH + 2, margin);
      let feeSum = 0n;
      for (const u of unitCols) {
        feeSum += chargeByUnit.get(u.unitId) ?? 0n;
      }
      y = this.drawSummaryTwoColumnRow(
        doc,
        margin,
        y,
        rowH,
        sumDescW,
        sumTotalW,
        `Taxa ${competenceYmPtBr} — soma dos valores devidos por unidade (total condomínio)`,
        feeSum,
      );

      if (ctx.charges.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor('#6b7280');
        const warnLines = this.wrapWordsToLines(
          doc,
          'Ainda não há cobranças geradas para esta competência. Execute o fechamento ou regenere as cobranças.',
          contentW - 8,
        );
        const wlh = doc.currentLineHeight(true) + 1.5;
        y = y + 6;
        y = this.drawTextLines(doc, margin + 4, y, warnLines, wlh, margin);
        y += 8;
        doc.fillColor('#000000');
      }

      doc.font('Helvetica').fontSize(9).fillColor('#5a6572');
      const hintExtrato = this.wrapWordsToLines(
        doc,
        'O detalhe da cota em cada despesa e o valor da taxa por unidade constam na seção «Extrato por unidade».',
        contentW,
      );
      const hexLh = doc.currentLineHeight(true) + 2.5;
      y += 10;
      y = this.drawTextLines(doc, margin, y, hintExtrato, hexLh, margin);
      doc.fillColor('#000000');
      y += 12;

      const pixAndFooterMin = ctx.pixQrPng
        ? 360
        : ctx.pixPayload
          ? 220
          : ctx.pixKey
            ? 160
            : 100;
      y += 28;
      if (y + pixAndFooterMin > doc.page.maxY() - 12) {
        doc.addPage();
        doc.x = margin;
        doc.y = margin;
        y = margin;
      }

      doc.save();
      doc.strokeColor('#d4dbe3').lineWidth(0.65);
      doc.moveTo(margin, y).lineTo(margin + contentW, y).stroke();
      doc.restore();
      y += 18;

      doc.font('Helvetica-Bold').fontSize(12).fillColor(accent);
      doc.text('Pagamento via PIX', margin, y, { lineBreak: false });
      y += 16;

      const hasPixData = !!(ctx.pixKey || ctx.pixPayload);
      if (hasPixData) {
        const instrBody =
          ctx.pixQrPng && ctx.pixPayload
            ? `Para quitar a taxa condominial de ${competenceYmPtBr}, utilize PIX com os dados indicados nesta página. No aplicativo do seu banco, pode pagar lendo o QR Code abaixo, informando manualmente a chave PIX ou colando o código completo no campo «Pix Copia e cola». Confira o nome do beneficiário antes de confirmar a transferência.`
            : ctx.pixPayload
              ? `Para quitar a taxa condominial de ${competenceYmPtBr}, utilize PIX com os dados indicados nesta página. No aplicativo do seu banco, informe manualmente a chave PIX ou cole o código completo no campo «Pix Copia e cola». Confira o nome do beneficiário antes de confirmar a transferência.`
              : `Para quitar a taxa condominial de ${competenceYmPtBr}, utilize PIX com a chave indicada nesta página. No aplicativo do seu banco, informe manualmente a chave PIX (tipo e valor abaixo). Confira o nome do beneficiário antes de confirmar a transferência.`;
        doc.font('Helvetica').fontSize(9).fillColor('#333333');
        const instrLines = this.wrapWordsToLines(doc, instrBody, contentW);
        const instrLh = doc.currentLineHeight(true) + 2;
        y = this.drawTextLines(doc, margin, y, instrLines, instrLh, margin);
        y += 12;

        doc.save();
        doc.strokeColor('#d4dbe3').lineWidth(0.5);
        doc.moveTo(margin, y).lineTo(margin + contentW, y).stroke();
        doc.restore();
        y += 10;

        doc.font('Helvetica-Bold').fontSize(10).fillColor(accent);
        doc.text('Dados da chave PIX', margin, y, { lineBreak: false });
        y += 14;
        doc.font('Helvetica').fontSize(9).fillColor('#222222');
        if (ctx.pixBeneficiaryLabel) {
          const benLines = this.wrapWordsToLines(
            doc,
            `Beneficiário (recebedor): ${ctx.pixBeneficiaryLabel}`,
            contentW,
          );
          const benLh = doc.currentLineHeight(true) + 1.5;
          y = this.drawTextLines(doc, margin, y, benLines, benLh, margin);
          y += 4;
        }
        if (ctx.pixCity) {
          doc.text(`Cidade: ${ctx.pixCity}`, margin, y, {
            width: contentW,
            lineBreak: false,
          });
          y += doc.currentLineHeight(true) + 6;
        }
        if (ctx.pixKey) {
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#333333');
          doc.text('Chave PIX (digitar ou conferir no banco):', margin, y, {
            width: contentW,
          });
          y += doc.currentLineHeight(true) + 3;
          doc.font('Courier').fontSize(9).fillColor('#111111');
          const keyLines = this.wrapWordsToLines(doc, ctx.pixKey, contentW);
          const keyLh = doc.currentLineHeight(true) + 1;
          y = this.drawTextLines(doc, margin, y, keyLines, keyLh, margin);
          y += 10;
        }

        if (ctx.pixQrPng && ctx.pixPayload) {
          doc.font('Helvetica-Bold').fontSize(10).fillColor(accent);
          doc.text('QR Code e código «Copia e cola»', margin, y, {
            lineBreak: false,
          });
          y += 14;

          const pixBlockH = 152;
          y = this.ensureSpace(doc, y, pixBlockH + 8, margin);
          doc.save();
          doc
            .roundedRect(margin, y - 8, contentW, pixBlockH + 16, 6)
            .fill('#f8fafc')
            .strokeColor('#d8e0ea')
            .lineWidth(0.55)
            .stroke();
          doc.restore();
          doc.image(ctx.pixQrPng, margin + 8, y, { width: 124 });
          doc.font('Helvetica').fontSize(8).fillColor('#333333');
          doc.text('Copia e cola (PIX):', margin + 148, y + 4, {
            lineBreak: false,
          });
          // Uma única chamada `doc.text()` com chunks unidos por `\n`:
          // o texto copiado sai contínuo (só quebras entre trechos),
          // sem espaços intrusivos que invalidariam o BR Code.
          doc.font('Courier').fontSize(6.5).fillColor('#111111');
          const pixColW = contentW - 168;
          const perLineRp = Math.max(
            10,
            Math.floor(pixColW / Math.max(1, doc.widthOfString('M'))),
          );
          doc.text(
            this.chunkFixedChars(ctx.pixPayload, perLineRp).join('\n'),
            margin + 148,
            y + 18,
            {
              width: pixColW,
              lineBreak: true,
              lineGap: 1,
            },
          );
          doc.fillColor('#000000');
          y = Math.max(y + 128, doc.y) + 20;
        } else if (ctx.pixPayload) {
          doc.font('Helvetica-Bold').fontSize(10).fillColor(accent);
          doc.text('Código «Copia e cola» (PIX)', margin, y, {
            lineBreak: false,
          });
          y += 14;
          doc.font('Courier').fontSize(6.5).fillColor('#111111');
          const pixColW = contentW - 8;
          const perLineRp2 = Math.max(
            10,
            Math.floor(pixColW / Math.max(1, doc.widthOfString('M'))),
          );
          doc.text(
            this.chunkFixedChars(ctx.pixPayload, perLineRp2).join('\n'),
            margin,
            y,
            {
              width: pixColW,
              lineBreak: true,
              lineGap: 1,
            },
          );
          doc.fillColor('#000000');
          y = doc.y + 16;
        }
      } else {
        doc.font('Helvetica').fontSize(9.5).fillColor('#5a6572');
        const hintLines = this.wrapWordsToLines(
          doc,
          'Cadastre a chave PIX nas definições do condomínio (editar condomínio, seção de cobrança). O PDF incluirá instruções e a chave em texto. O QR Code e o código «Copia e cola» só são gerados quando essa opção está ativada nas definições do condomínio.',
          contentW,
        );
        const hlh = doc.currentLineHeight(true) + 2;
        y = this.drawTextLines(doc, margin, y, hintLines, hlh, margin);
        doc.fillColor('#000000');
        y += 12;
      }

      y += 14;
      y = this.ensureSpace(doc, y, 64, margin);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(accent);
      doc.text('Comprovante de pagamento', margin, y, { lineBreak: false });
      y += 16;
      doc.font('Helvetica').fontSize(9).fillColor('#222222');
      const comprovanteBody = ctx.syndicWhatsapp
        ? `Após efetuar o pagamento, envie o comprovante (print ou PDF) para o WhatsApp do síndico: ${ctx.syndicWhatsapp}.`
        : 'Após efetuar o pagamento, envie o comprovante ao síndico. Configure o WhatsApp nas definições do condomínio ou associe telefone à ficha do síndico em Planejamento / participantes.';
      const compLines = this.wrapWordsToLines(doc, comprovanteBody, readabilityW);
      const compLh = doc.currentLineHeight(true) + 1.5;
      y = this.drawTextLines(doc, margin, y, compLines, compLh, margin);
      y += 10;
      }
      y = this.ensureSpace(doc, y, 36, margin);
      doc.font('Helvetica').fontSize(7.5).fillColor('#666666');
      const footLines = this.wrapWordsToLines(
        doc,
        'Documento gerado eletronicamente para fins de transparência perante os condôminos. Os valores por unidade decorrem do rateio registrado no sistema na data de emissão.',
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
    const intro = `Lançamentos entre ${periodLabel}. Os saldos acumulados de cada fundo estão na tabela anterior. «Valor» é o montante do movimento (não o saldo). Em Receitas: aparecem as quitações da taxa condominial (competência ${competenceYmPtBr}) e as demais receitas registradas; se uma quitação tiver receita contábil vinculada, essa receita não é repetida abaixo.`;
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

    const incomesAll = periodTransactions.filter((t) => t.kind === 'income');
    const outflows = periodTransactions.filter(
      (t) => t.kind === 'expense' || t.kind === 'investment',
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

  /**
   * Um bloco por unidade: cada despesa com a cota da unidade + taxa devida.
   * Escala a qualquer número de unidades (sem colunas horizontais por unidade).
   */
  private renderUnitExtratoMensalSection(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc: any,
    margin: number,
    contentW: number,
    yStart: number,
    unitCols: UnitCol[],
    fixos: FinancialTransaction[],
    variavel: FinancialTransaction[],
    charges: CondominiumFeeCharge[],
    competenceYmPtBr: string,
  ): number {
    const accent = '#1a3a52';
    const totalColW = 88;
    const descColW = contentW - totalColW - 8;
    let y = yStart;

    y = this.ensureSpace(doc, y, 72, margin);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#121820');
    doc.text('Extrato por unidade', margin, y, { lineBreak: false });
    y += 22;
    doc.font('Helvetica').fontSize(9.5).fillColor('#1e293b');
    const intro = `Competência ${competenceYmPtBr}. Em cada lançamento, condôminos do mesmo agrupamento têm a mesma cota, tomada pelo maior valor entre eles; quando o rateio gera restos, o extrato prefere valores iguais ou ligeiramente superiores ao lançamento (nunca inferiores entre equivalentes). Inclui o valor da taxa condominial devido conforme cobrança.`;
    const introLines = this.wrapWordsToLines(doc, intro, contentW);
    const ilh = doc.currentLineHeight(true) + 3;
    y = this.drawTextLines(doc, margin, y, introLines, ilh, margin);
    y += 18;
    doc.fillColor('#111827');

    const expenseRows = [...fixos, ...variavel];
    const chargeByUnit = new Map<string, bigint>();
    for (const c of charges) {
      chargeByUnit.set(c.unitId, BigInt(String(c.amountDueCents)));
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

    for (let ui = 0; ui < unitCols.length; ui++) {
      const uc = unitCols[ui]!;
      const respRaw = uc.responsibleName?.trim() ?? '';
      doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
      const respLines = respRaw.length
        ? this.wrapWordsToLines(
            doc,
            `Responsável: ${respRaw}`,
            contentW - 24,
          )
        : [];
      const respLh = doc.currentLineHeight(true) + 1.5;
      const respBlockH =
        respLines.length > 0 ? 4 + respLines.length * respLh : 0;
      const blockTopH = 40 + respBlockH + 8;
      y = this.ensureSpace(doc, y, blockTopH + 48, margin);

      doc.save();
      doc
        .roundedRect(margin, y - 2, contentW, blockTopH - 2, 4)
        .fill('#f4f7fb')
        .stroke('#d8e0ea');
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
      if (respLines.length > 0) {
        doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
        for (const rl of respLines) {
          doc.text(rl, margin + 10, cy, { lineBreak: false });
          cy += respLh;
        }
      }
      doc.fillColor('#111827');
      y += blockTopH + 8;

      y = drawMiniHeader(y);

      for (const t of expenseRows) {
        const { declared, byUnit: rawByUnit } =
          this.expenseRowAmountsForUnitTable(t, unitCols);
        const partIdx = this.participatingUnitIndicesForTx(t, unitCols);
        const byUnit = this.equalizeExtratoRowShares(
          unitCols,
          declared,
          rawByUnit,
          partIdx,
        );
        const part = byUnit[ui] ?? 0n;
        doc.fillColor('#111827');
        doc.font('Helvetica').fontSize(8.5);
        const rowLabel = `${this.kindLabelPt(t.kind)} · ${this.displayTransactionTitleForPdf(t.title)}`;
        const titleLines = this.wrapWordsToLines(doc, rowLabel, descColW - 14);
        const tlh = doc.currentLineHeight(true) + 1;
        const rh = Math.max(22, 8 + titleLines.length * tlh);
        y = this.ensureSpace(doc, y, rh + 2, margin);
        doc.rect(margin, y, descColW, rh).stroke('#e8ecf0');
        doc.rect(margin + descColW, y, totalColW, rh).stroke('#e8ecf0');
        let ty = y + 5;
        for (const tl of titleLines) {
          doc.fillColor('#111827');
          doc.text(tl, margin + 6, ty, { lineBreak: false });
          ty += tlh;
        }
        const cell = part === 0n ? '—' : this.brl(part);
        const cellY = y + Math.max(5, (rh - tlh) / 2);
        doc.fillColor('#0f172a');
        doc.font('Helvetica-Bold').fontSize(8.5);
        doc.text(
          cell,
          margin + descColW + totalColW - 6 - doc.widthOfString(cell),
          cellY,
          { lineBreak: false },
        );
        doc.font('Helvetica');
        y += rh;
      }

      const taxRh = 22;
      y = this.ensureSpace(doc, y, taxRh + 2, margin);
      const due = chargeByUnit.get(uc.unitId) ?? 0n;
      doc.rect(margin, y, descColW, taxRh).fill('#f0f7f2').stroke('#c5ddd0');
      doc
        .rect(margin + descColW, y, totalColW, taxRh)
        .fill('#f0f7f2')
        .stroke('#c5ddd0');
      doc.fillColor('#111827');
      doc.font('Helvetica-Bold').fontSize(8.5);
      doc.text(
        `Taxa condominial ${competenceYmPtBr} (valor devido)`,
        margin + 8,
        y + 6,
        { lineBreak: false },
      );
      const taxS = due === 0n ? '—' : this.brl(due);
      doc.fillColor('#0f172a');
      doc.text(
        taxS,
        margin + descColW + totalColW - 6 - doc.widthOfString(taxS),
        y + 6,
        { lineBreak: false },
      );
      doc.font('Helvetica');
      y += taxRh + 20;
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
}
