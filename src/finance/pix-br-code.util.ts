/**
 * Helpers de sanitização para geração do BR Code PIX (EMV MPM).
 *
 * O payload PIX segue o padrão EMV do BCB. Vários PSPs validam de forma
 * estrita e rejeitam o código quando o **Merchant Name** (59), **Merchant
 * City** (60) ou a descrição (26.02) contêm acentos, caracteres de
 * controle ou símbolos fora do repertório ASCII imprimível permitido.
 * Para evitar BR Codes aparentemente válidos que na verdade são recusados
 * pelos apps dos bancos, normalizamos e filtramos os campos aqui.
 */

const stripDiacritics = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const onlyAsciiPrintable = (s: string): string =>
  s.replace(/[^\x20-\x7E]/g, '');

/** Remove espaços internos e mantém apenas caracteres imprimíveis ASCII. */
export function sanitizePixKey(raw: string | null | undefined): string {
  if (!raw) return '';
  return onlyAsciiPrintable(stripDiacritics(String(raw))).trim();
}

/**
 * Nome do beneficiário (EMV 59). Padrão: ASCII, letras/números/espaço e
 * alguns separadores seguros (`.`, `-`, `&`), colapsa espaços e aplica
 * limite de 25 caracteres.
 */
export function sanitizePixName(raw: string, maxLen = 25): string {
  const ascii = onlyAsciiPrintable(stripDiacritics(String(raw ?? '')));
  return ascii
    .replace(/[^A-Za-z0-9 .\-&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Cidade do beneficiário (EMV 60). Padrão: ASCII, apenas letras, números
 * e espaços. Alguns PSPs só aceitam maiúsculas; aqui retornamos em
 * maiúsculas para maior compatibilidade.
 */
export function sanitizePixCity(raw: string, maxLen = 15): string {
  const ascii = onlyAsciiPrintable(stripDiacritics(String(raw ?? '')));
  return ascii
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, maxLen);
}

/**
 * Descrição/mensagem (EMV 26.02). Vários bancos recusam traços, barras e
 * acentos aqui. Mantemos apenas letras, números e espaço.
 */
export function sanitizePixMessage(raw: string, maxLen = 25): string {
  const ascii = onlyAsciiPrintable(stripDiacritics(String(raw ?? '')));
  return ascii
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** Reference Label (EMV 62.05). Apenas alfanumérico ASCII, máx. 25. */
export function sanitizePixReferenceLabel(
  raw: string,
  maxLen = 25,
): string {
  const ascii = onlyAsciiPrintable(stripDiacritics(String(raw ?? '')));
  return ascii.replace(/[^A-Za-z0-9]/g, '').slice(0, maxLen);
}

/* -------------------------------------------------------------------- */
/* Geração do BR Code (EMV MPM) PIX                                       */
/* -------------------------------------------------------------------- */

/**
 * CRC-16/CCITT-FALSE sobre bytes ASCII: polinômio 0x1021, init 0xFFFF,
 * refin/refout false, xorout 0. É o CRC exigido pelo BR Code do BCB.
 */
function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= (input.charCodeAt(i) & 0xff) << 8;
    for (let b = 0; b < 8; b++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Codifica um campo EMV (TLV) com length de 2 dígitos. */
function emv(id: string, value: string): string {
  if (!/^\d{2}$/.test(id)) {
    throw new Error(`EMV tag inválida: ${id}`);
  }
  const v = String(value ?? '');
  if (v.length > 99) {
    throw new Error(`EMV ${id} excede 99 chars (${v.length})`);
  }
  if (/[^\x20-\x7E]/.test(v)) {
    // Não aceitamos nada fora do ASCII imprimível no payload final:
    // combining marks, zero-width, controles etc. causam inconsistência
    // de length entre o valor declarado e o renderizado por scanners.
    throw new Error(`EMV ${id} contém caracteres não-ASCII imprimíveis`);
  }
  const len = v.length.toString().padStart(2, '0');
  return `${id}${len}${v}`;
}

export type BuildPixBrCodeInput = {
  /** Chave PIX já pronta (CPF, CNPJ, email, telefone ou UUID). */
  key: string;
  /** Nome do beneficiário (máx 25 chars ASCII imprimíveis). */
  name: string;
  /** Cidade do beneficiário (máx 15 chars ASCII imprimíveis). */
  city: string;
  /** Valor em reais. Usa 2 casas. Se omitido, o pagador define. */
  amount?: number;
  /** Descrição / mensagem (EMV 26.02). Máx 25 chars ASCII imprimíveis. */
  message?: string;
  /** Reference Label (EMV 62.05). Padrão «***» (sem identificador). */
  transactionId?: string;
};

/**
 * Gera o payload do BR Code PIX estático/dinâmico a partir de campos já
 * sanitizados. Não faz nenhuma manipulação «silenciosa» dos valores:
 * se algo inválido for passado, lança para evitar códigos corrompidos.
 *
 * Importante: a lib externa `qrcode-pix` faz `substring` antes de
 * `normalize('NFD')`, o que pode deixar o length declarado do campo
 * diferente do conteúdo real quando sobram combining marks ou chars
 * zero-width. Este gerador faz a validação explícita para impedir isso.
 */
export function buildPixBrCode(p: BuildPixBrCodeInput): string {
  const key = sanitizePixKey(p.key);
  if (!key) {
    throw new Error('Chave PIX vazia.');
  }
  const name = sanitizePixName(p.name, 25);
  if (!name) {
    throw new Error('Nome do beneficiário vazio após sanitização.');
  }
  const city = sanitizePixCity(p.city, 15);
  if (!city) {
    throw new Error('Cidade do beneficiário vazia após sanitização.');
  }
  const message =
    p.message != null ? sanitizePixMessage(p.message, 25) : '';
  const txId =
    p.transactionId && p.transactionId !== '***'
      ? sanitizePixReferenceLabel(p.transactionId, 25) || '***'
      : '***';

  const mai: string[] = [emv('00', 'BR.GOV.BCB.PIX'), emv('01', key)];
  if (message) {
    mai.push(emv('02', message));
  }

  const parts: string[] = [
    emv('00', '01'),
    emv('26', mai.join('')),
    emv('52', '0000'),
    emv('53', '986'),
  ];

  if (typeof p.amount === 'number' && Number.isFinite(p.amount) && p.amount > 0) {
    const amountStr = p.amount.toFixed(2);
    if (amountStr.length > 13) {
      throw new Error('Valor PIX excede o tamanho máximo do campo.');
    }
    parts.push(emv('54', amountStr));
  }

  parts.push(emv('58', 'BR'));
  parts.push(emv('59', name));
  parts.push(emv('60', city));
  parts.push(emv('62', emv('05', txId)));
  parts.push('6304');

  const base = parts.join('');
  const crc = crc16CcittFalse(base);
  const payload = `${base}${crc}`;
  // Sanity check: todo o payload precisa ser ASCII imprimível e o
  // comprimento dos campos declarados precisa bater com o conteúdo.
  if (/[^\x20-\x7E]/.test(payload)) {
    throw new Error('Payload PIX contém caracteres não-ASCII.');
  }
  return payload;
}
