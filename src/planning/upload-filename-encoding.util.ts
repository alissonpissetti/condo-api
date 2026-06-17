/**
 * Multer/busboy expõe `originalname` como se cada byte do nome fosse Latin-1.
 * Os browsers enviam o nome em UTF-8 → aparecem sequências tipo "Ã§" em vez de "ç".
 */
export function normalizeMulterOriginalName(name: string): string {
  const t = name.trim();
  if (!t) return t;
  try {
    const decoded = Buffer.from(t, 'latin1').toString('utf8');
    if (!decoded.includes('\uFFFD')) {
      return decoded;
    }
  } catch {
    /* ignore */
  }
  return t;
}

function isLatin1OnlyString(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xff) return false;
  }
  return true;
}

/**
 * Alguns uploads gravam UTF-8 com o byte de lead C3 trocado por CC e uma letra ASCII
 * extra (ex.: "OrcÌ§amento" em vez de "Orçamento", "AVALICÌ§OÌES" em vez de "AVALIAÇÕES").
 */
function repairCcLeadMojibake(stored: string): string | null {
  const bytes = Buffer.from(stored, 'latin1');
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (i + 2 < bytes.length && bytes[i + 1] === 0xcc) {
      const cont = bytes[i + 2];
      if (b === 0x43 && cont === 0xa7) {
        const next = bytes[i + 3];
        if (next === 0x4f && i + 4 < bytes.length && bytes[i + 4] === 0xcc) {
          out.push(0x41, 0xc3, 0x87);
          i += 2;
          continue;
        }
        out.push(0xc3, 0x87);
        i += 2;
        continue;
      }
      if (b === 0x63 && cont === 0xa7) {
        out.push(0xc3, 0xa7);
        i += 2;
        continue;
      }
      if (b === 0x41 && cont < 0x80) {
        out.push(0xc3, 0x83, cont);
        i += 2;
        continue;
      }
      if (b === 0x4f && cont < 0x80) {
        out.push(0xc3, 0x95, cont);
        i += 2;
        continue;
      }
      if (b >= 0x41 && b <= 0x7a && cont >= 0x80 && cont <= 0xbf) {
        out.push(0xc3, cont);
        i += 2;
        continue;
      }
    }
    out.push(b);
  }
  const decoded = Buffer.from(out).toString('utf8');
  if (decoded.includes('\uFFFD') || decoded === stored) return null;
  return decoded;
}

/**
 * Recupera UTF-8 quando o nome já foi gravado na BD como "caracteres Latin-1"
 * (cada byte do UTF-8 virou um codepoint à parte) ou com lead byte CC corrompido.
 */
export function repairMojibakeUtf8Filename(stored: string): string {
  if (!stored || !isLatin1OnlyString(stored)) return stored;

  try {
    const decoded = Buffer.from(stored, 'latin1').toString('utf8');
    if (!decoded.includes('\uFFFD') && decoded !== stored) {
      return decoded;
    }
  } catch {
    /* ignore */
  }

  const ccFixed = repairCcLeadMojibake(stored);
  if (ccFixed) return ccFixed;

  return stored;
}

/** Nome de upload Multer já normalizado e com reparo defensivo. */
export function encodeUploadOriginalFilename(name: string): string {
  const trimmed = (name || 'anexo').trim() || 'anexo';
  return repairMojibakeUtf8Filename(normalizeMulterOriginalName(trimmed));
}
