const COMPETENCE_YM_RE = /^\d{4}-\d{2}$/;
const UNIT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FEE_SLIP_KEY_RE =
  /^fee-slips\/\d{4}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

/** Caminho relativo determinístico (sobrescrito a cada envio da mesma competência/unidade). */
export function feeSlipRelativeKey(
  competenceYm: string,
  unitId: string,
): string {
  const ym = competenceYm.trim();
  const uid = unitId.trim();
  if (!COMPETENCE_YM_RE.test(ym)) {
    throw new Error('competenceYm inválido para slip');
  }
  if (!UNIT_ID_RE.test(uid)) {
    throw new Error('unitId inválido para slip');
  }
  return `fee-slips/${ym}/${uid}.pdf`;
}

export function isValidFeeSlipKey(key: string | null | undefined): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }
  return FEE_SLIP_KEY_RE.test(key);
}
