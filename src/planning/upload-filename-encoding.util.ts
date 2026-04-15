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

/**
 * Recupera UTF-8 quando o nome já foi gravado na BD como "caracteres Latin-1"
 * (cada byte do UTF-8 virou um codepoint à parte).
 * Só actua se houver prefixos típicos (C2/C3 → Â/Ã) e todos os codepoints couberem
 * num byte (caso contrário, não se pode reconstruir a sequência original).
 */
export function repairMojibakeUtf8Filename(stored: string): string {
  if (!stored || !/[\u00c2\u00c3]/.test(stored)) return stored;
  for (let i = 0; i < stored.length; i++) {
    if (stored.charCodeAt(i) > 0xff) return stored;
  }
  try {
    const decoded = Buffer.from(stored, 'latin1').toString('utf8');
    if (!decoded.includes('\uFFFD')) return decoded;
  } catch {
    /* ignore */
  }
  return stored;
}
