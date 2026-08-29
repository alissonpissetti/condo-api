import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import {
  drawDocumentHeaderLogo,
  installPlatformWatermarkUnderAllContent,
  stampPlatformFooterOnAllPages,
} from '../common/pdf-branding';
import { APP_TIMEZONE } from '../common/america-sao-paulo-time.util';
import { CondominiumsService } from '../condominiums/condominiums.service';
import { CondominiumParticipant } from '../planning/entities/condominium-participant.entity';
import { GovernanceRole } from '../planning/enums/governance-role.enum';
import type { CondoAccess } from '../planning/governance.service';
import { GovernanceService } from '../planning/governance.service';
import type { ReceiptStoragePort } from '../storage/receipt-storage.port';
import { RECEIPT_STORAGE } from '../storage/storage.tokens';
import { Unit } from '../units/unit.entity';
import { resolveUnitFinancialResponsiblePerson } from '../units/unit-financial-responsible.util';
import { UsersService } from '../users/users.service';
import { todayLocalCalendarAsUtcNoon } from './date-only.util';
import { CondominiumFeeCharge } from './entities/condominium-fee-charge.entity';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');

const UNIT_REL = {
  grouping: true,
  ownerPerson: true,
  financialResponsiblePerson: true,
  responsibleLinks: { person: true },
} as const;

const MONTHS_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function formatCpfBr(digits: string | null | undefined): string {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (d.length !== 11) {
    return d || '—';
  }
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function competenceYmToPt(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) {
    return ym;
  }
  const idx = Number.parseInt(m[2], 10) - 1;
  if (idx < 0 || idx > 11) {
    return ym;
  }
  return `${MONTHS_PT[idx]} de ${m[1]}`;
}

function formatLongDatePt(d: Date): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(d);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const day = pick('day');
  const month = pick('month');
  const year = pick('year');
  return `${day} de ${month} de ${year}`;
}

function buildUnitLabel(unit: Unit): string {
  const ident = unit.identifier?.trim() || '—';
  const grouping = unit.grouping?.name?.trim();
  if (grouping) {
    return `${ident} (${grouping})`;
  }
  return ident;
}

@Injectable()
export class CondominiumClearanceDeclarationPdfService {
  constructor(
    private readonly condominiumsService: CondominiumsService,
    private readonly governance: GovernanceService,
    @InjectRepository(CondominiumFeeCharge)
    private readonly chargeRepo: Repository<CondominiumFeeCharge>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(CondominiumParticipant)
    private readonly participantRepo: Repository<CondominiumParticipant>,
    @Inject(RECEIPT_STORAGE)
    private readonly storage: ReceiptStoragePort,
    private readonly usersService: UsersService,
  ) {}

  async buildClearanceDeclarationPdf(
    condominiumId: string,
    userId: string,
    unitId: string,
  ): Promise<Buffer> {
    const normalizedUnitId = unitId?.trim();
    if (!normalizedUnitId) {
      throw new BadRequestException('unitId is required');
    }

    const { unitIds } = await this.feeChargesScope(condominiumId, userId);
    if (unitIds !== null && !unitIds.includes(normalizedUnitId)) {
      throw new ForbiddenException('Unit not accessible');
    }

    const condo = await this.condominiumsService.findOneAccessible(
      condominiumId,
      userId,
    );

    const unit = await this.unitRepo.findOne({
      where: { id: normalizedUnitId, grouping: { condominiumId } },
      relations: UNIT_REL,
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    const today = todayLocalCalendarAsUtcNoon();
    const openChargesDueByToday = await this.chargeRepo.find({
      where: {
        condominiumId,
        unitId: normalizedUnitId,
        status: 'open',
        dueOn: LessThanOrEqual(today),
      },
      order: { competenceYm: 'ASC' },
    });
    if (openChargesDueByToday.length > 0) {
      throw new BadRequestException(
        'Unit has open condominium fee charges. Settle all charges before issuing a clearance declaration.',
      );
    }

    const paidCharges = await this.chargeRepo.find({
      where: { condominiumId, unitId: normalizedUnitId, status: 'paid' },
      order: { competenceYm: 'DESC' },
      take: 1,
    });
    const latestPaid = paidCharges[0] ?? null;

    const syndic = await this.getSyndicSigner(condominiumId);
    const responsible = resolveUnitFinancialResponsiblePerson({
      financialResponsiblePerson: unit.financialResponsiblePerson,
      responsibleLinks: unit.responsibleLinks,
      responsibleDisplayName: unit.responsibleDisplayName,
      ownerPerson: unit.ownerPerson,
      ownerDisplayName: unit.ownerDisplayName,
    });
    const responsibleName = responsible.name;
    const responsibleCpf = formatCpfBr(responsible.cpf);
    const unitLabel = buildUnitLabel(unit);
    const emissionDate = formatLongDatePt(new Date());
    const place =
      condo.billingPixCity?.trim() ||
      responsible.addressCity?.trim() ||
      unit.ownerPerson?.addressCity?.trim() ||
      '—';

    let quitacaoRef: string;
    if (latestPaid) {
      quitacaoRef = `competência de ${competenceYmToPt(latestPaid.competenceYm)}`;
    } else {
      quitacaoRef = 'a presente data, conforme registros do condomínio';
    }

    const declarationBody = [
      `Declaro, para todos os fins de direito, em especial para fins de compra, venda, locação, financiamento ou transferência de imóvel, que o(a) Sr(a). ${responsibleName}, inscrito(a) no CPF sob o nº ${responsibleCpf}, responsável pela unidade ${unitLabel} do Condomínio ${condo.name}, encontra-se quite com suas contribuições condominiais (taxas ordinárias, extraordinárias e encargos administrados pelo condomínio) registradas neste sistema, até ${quitacaoRef}, não possuindo débitos, multas, juros ou encargos pendentes até a presente data.`,
      '',
      'Por ser expressão da verdade, dou fé e firmo a presente declaração.',
    ].join('\n');

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
          Title: 'Declaração de quitação de débitos condominiais',
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

      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#1a1a1a')
        .text('DECLARAÇÃO DE QUITAÇÃO DE DÉBITOS CONDOMINIAIS', {
          align: 'center',
          width: w,
        });
      doc.moveDown(0.25);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#444444')
        .text('Certidão negativa de débito condominial (CND)', {
          align: 'center',
          width: w,
        });
      doc.fillColor('#000000');
      doc.moveDown(1.2);

      doc.font('Helvetica-Bold').fontSize(11).text('Dados do condomínio');
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(`Nome: ${condo.name}`, { width: w });
      doc.moveDown(0.75);

      doc.font('Helvetica-Bold').fontSize(11).text('Unidade e condômino');
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(10.5);
      doc.text(`Unidade: ${unitLabel}`, { width: w });
      doc.text(`Responsável financeiro: ${responsibleName}`, { width: w });
      doc.text(`CPF: ${responsibleCpf}`, { width: w });
      doc.moveDown(0.75);

      doc.font('Helvetica-Bold').fontSize(11).text('Declaração');
      doc.moveDown(0.35);
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor('#1a1a1a')
        .text(declarationBody, { width: w, align: 'justify', lineGap: 3 });
      doc.fillColor('#000000');
      doc.moveDown(1.5);

      doc.font('Helvetica').fontSize(10.5).text(`${place}, ${emissionDate}.`, {
        width: w,
      });
      doc.moveDown(2);

      const syndicLine =
        syndic.displayName?.trim() || '_______________________________';
      if (syndic.signaturePng) {
        const imgMaxW = Math.min(200, w);
        const imgMaxH = 56;
        const imgX = left + (w - imgMaxW) / 2;
        const imgY = doc.y;
        try {
          doc.image(syndic.signaturePng, imgX, imgY, {
            fit: [imgMaxW, imgMaxH],
            align: 'center',
            valign: 'center',
          });
          doc.y = imgY + imgMaxH + 10;
        } catch {
          doc.moveDown(1.5);
        }
      } else {
        doc.moveDown(1.5);
      }
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .text(syndicLine, { width: w, align: 'center' });
      doc.moveDown(0.15);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`Síndico(a) do Condomínio ${condo.name}`, {
          width: w,
          align: 'center',
        });
      doc.moveDown(1.2);

      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#666666')
        .text(
          'Documento emitido eletronicamente com base nos registros financeiros do condomínio. Para transações formais, a administradora ou cartório pode exigir reconhecimento de firma do síndico e documentos complementares.',
          { width: w, align: 'justify' },
        );

      stampPlatformFooterOnAllPages(doc);
      doc.end();
    });
  }

  private async getSyndicSigner(
    condominiumId: string,
  ): Promise<{ displayName: string | null; signaturePng: Buffer | null }> {
    const row = await this.participantRepo.findOne({
      where: { condominiumId, role: GovernanceRole.Syndic },
      order: { createdAt: 'ASC' },
      relations: { person: true, user: true },
    });
    if (!row) {
      return { displayName: null, signaturePng: null };
    }
    const linked = row.person?.fullName?.trim();
    const email = row.user?.email?.trim();
    const displayName = linked || email || null;
    const userId = row.userId?.trim();
    const signaturePng =
      userId != null && userId.length > 0
        ? await this.usersService.getUserSignatureBuffer(userId)
        : null;
    return { displayName, signaturePng };
  }

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
}
