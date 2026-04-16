import * as fs from 'fs';
import * as path from 'path';

const FOOTER_LOGO = 'meucondominio-logo.png';

/**
 * Caminho absoluto da marca meucondominio.cloud nos PDFs (copiado para `build/assets` no build).
 */
export function resolveMeuCondominioFooterLogoPath(): string | null {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'branding', FOOTER_LOGO),
    path.join(process.cwd(), 'build', 'assets', 'branding', FOOTER_LOGO),
    path.join(process.cwd(), 'src', 'assets', 'branding', FOOTER_LOGO),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

export type StampPlatformFooterOptions = {
  /** Se false, omite o texto do domínio (mantém linha e, se existir, o logo). */
  showDomainLabel?: boolean;
};

export type PlatformWatermarkOptions = {
  /** Opacidade do PNG (0–1). Por defeito bem leve. */
  opacity?: number;
  /**
   * Largura do logo como múltiplo da largura física da página (1 = largura da folha;
   * ~1,2 = marca grande centrada com recorte ligeiro nas laterais).
   */
  pageWidthRatio?: number;
};

/** Proporção aproximada do asset do rodapé (56×22). */
const LOGO_ASPECT = 56 / 22;

function drawPlatformWatermarkOnCurrentPage(
  doc: any,
  logoPath: string,
  opts?: PlatformWatermarkOptions,
): void {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- PDFKit */
  const { width, height } = doc.page;
  const opacity = opts?.opacity ?? 0.055;
  /** ~120% da largura da folha: grande em toda a página, com menos “estouro” nas beiras que antes. */
  const pageWidthRatio = opts?.pageWidthRatio ?? 1.2;
  const iw = width * pageWidthRatio;
  const ih = iw / LOGO_ASPECT;
  const ix = (width - iw) / 2;
  const iy = (height - ih) / 2;

  doc.save();
  try {
    doc.opacity(opacity);
    doc.image(logoPath, ix, iy, { width: iw });
  } catch {
    /* ficheiro em falta ou inválido */
  }
  doc.restore();
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
}

/**
 * Garante marca d'água **por baixo de todo o conteúdo**: desenha-a no início de cada
 * página e volta a desenhar após cada `addPage()`. Chamar imediatamente após
 * `new PDFDocument({ bufferPages: true, ... })`, **antes** de qualquer outro desenho.
 */
export function installPlatformWatermarkUnderAllContent(
  doc: any,
  opts?: PlatformWatermarkOptions,
): void {
  const logoPath = resolveMeuCondominioFooterLogoPath();
  if (!logoPath) {
    return;
  }

  const stamp = () => drawPlatformWatermarkOnCurrentPage(doc, logoPath, opts);
  stamp();

  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- PDFKit monkey-patch */
  const d = doc as { addPage?: (...args: unknown[]) => unknown };
  const original = d.addPage;
  if (typeof original !== 'function') {
    return;
  }
  d.addPage = (...args: unknown[]) => {
    const ret = original.apply(doc, args);
    stamp();
    return ret;
  };
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
}

/**
 * Desenha rodapé em todas as páginas: linha discreta, marca alinhada à direita.
 * Exige `bufferPages: true` no PDFDocument. Usa `page.margins.bottom` como faixa útil.
 */
export function stampPlatformFooterOnAllPages(
  doc: any,
  opts?: StampPlatformFooterOptions,
): void {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- PDFKit */
  const showDomainLabel = opts?.showDomainLabel !== false;
  const logoPath = resolveMeuCondominioFooterLogoPath();
  const range = doc.bufferedPageRange();
  const label = 'meucondominio.cloud';
  const logoMaxW = 56;
  const logoMaxH = 22;
  const rightPad = 10;
  const lineInset = 2;

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const { width, height, margins } = doc.page;
    const ml = margins.left;
    const mr = margins.right;
    const mb = margins.bottom;

    const bandTop = height - mb;
    const lineY = bandTop + 8;
    const innerLeft = ml + lineInset;
    const innerRight = width - mr - lineInset;
    const blockRight = width - mr - rightPad;

    doc.save();
    doc.lineWidth(0.45).strokeColor('#d0d0d0');
    doc.moveTo(innerLeft, lineY).lineTo(innerRight, lineY).stroke();

    let labelY = lineY + 12;
    try {
      if (logoPath) {
        const logoTop = lineY + 6;
        const logoX = blockRight - logoMaxW;
        doc.image(logoPath, logoX, logoTop, { width: logoMaxW });
        labelY = logoTop + logoMaxH + 4;
      }
    } catch {
      labelY = lineY + 14;
    }

    if (showDomainLabel) {
      doc.font('Helvetica').fontSize(6.75).fillColor('#7a7a7a');
      /** Sem `width` / LineWrapper — evita `continueOnNewPage()` e páginas em branco. */
      const tw = doc.widthOfString(label);
      doc.text(label, blockRight - tw, labelY, { lineBreak: false });
    }
    doc.restore();
  }
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
}

/**
 * Logo do condomínio (buffer) no topo; devolve a nova posição Y aproximada abaixo da imagem.
 */
export function drawCondominiumHeaderLogo(
  doc: any,
  logoBuffer: Buffer,
  marginLeft: number,
  startY: number,
  height = 48,
): number {
  /* eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- PDFKit */
  doc.image(logoBuffer, marginLeft, startY, { height });
  return startY + height + 10;
}

/**
 * Timbragem do topo: apenas logo de gestão do condomínio (se existir).
 * A marca da plataforma usa marca d'água (`installPlatformWatermarkUnderAllContent`).
 */
export function drawDocumentHeaderLogo(
  doc: any,
  marginLeft: number,
  startY: number,
  condoLogoBuffer: Buffer | null | undefined,
  height = 48,
): number {
  /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- PDFKit */
  if (condoLogoBuffer && condoLogoBuffer.length > 0) {
    doc.image(condoLogoBuffer, marginLeft, startY, { height });
    return startY + height + 10;
  }
  /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  return startY;
}
