/** Taxa condominial em aberto: rótulos conforme data de vencimento vs hoje (AAAA-MM-DD). */

export function isOpenFeePastDue(
  dueOnYmd: string,
  todayYmd: string,
): boolean {
  return dueOnYmd.trim() < todayYmd.trim();
}

export function openFeePaymentStatus(
  dueOnYmd: string,
  todayYmd: string,
): 'overdue' | 'pending' {
  return isOpenFeePastDue(dueOnYmd, todayYmd) ? 'overdue' : 'pending';
}

export function openFeeLineTypeLabelPt(
  dueOnYmd: string,
  todayYmd: string,
): string {
  return isOpenFeePastDue(dueOnYmd, todayYmd)
    ? 'Taxa em atraso'
    : 'Taxa prevista';
}

export function openFeeStatusLabelPt(
  dueOnYmd: string,
  todayYmd: string,
): string {
  return isOpenFeePastDue(dueOnYmd, todayYmd) ? 'Em atraso' : 'Previsto';
}

export function openFeeTitle(
  unitIdentifier: string,
  groupingName: string | null | undefined,
  competenceYm: string,
  dueOnYmd: string,
  todayYmd: string,
): string {
  const prefix = isOpenFeePastDue(dueOnYmd, todayYmd)
    ? 'Taxa em atraso'
    : 'Taxa prevista';
  const uid = unitIdentifier.trim() || '—';
  const grp = groupingName?.trim();
  return grp
    ? `${prefix} — ${uid} (${grp}) · ${competenceYm}`
    : `${prefix} — ${uid} · ${competenceYm}`;
}

export function genericOpenFeeMovementTitle(
  dueOnYmd: string,
  todayYmd: string,
  competenceYm: string | null | undefined,
): string {
  const compSuffix = competenceYm?.trim()
    ? ` — ${competenceYm.trim()}`
    : '';
  const prefix = isOpenFeePastDue(dueOnYmd, todayYmd)
    ? 'Taxa condominial em atraso'
    : 'Taxa condominial prevista';
  return `${prefix}${compSuffix}`;
}
