import type { CondoAccess } from '../planning/governance.service';
import { GovernanceRole } from '../planning/enums/governance-role.enum';
import { genericOpenFeeMovementTitle } from './open-fee-due.util';

/** Ex.: `2026-03` → `Março/2026` */
export function formatCompetenceYmPtBr(ym: string | null | undefined): string {
  const head = (ym ?? '').trim();
  const m = /^(\d{4})-(\d{2})$/.exec(head);
  if (!m) {
    return head || '—';
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

/** Título de quitação ou taxa em aberto sem identificar unidade. */
export function genericFeeMovementTitle(
  lineType: string | undefined,
  competenceYm: string | null | undefined,
  dueOnYmd?: string,
  todayYmd?: string,
): string {
  const compSuffix = competenceYm?.trim()
    ? ` — ${formatCompetenceYmPtBr(competenceYm)}`
    : '';
  switch (lineType) {
    case 'fee_payment':
      return `Taxa condominial quitada${compSuffix}`;
    case 'fee_overdue':
      if (dueOnYmd?.trim() && todayYmd?.trim()) {
        return genericOpenFeeMovementTitle(dueOnYmd, todayYmd, competenceYm);
      }
      return `Taxa condominial em atraso${compSuffix}`;
    default:
      return 'Taxa condominial';
  }
}

export function accessAllowsManagement(access: CondoAccess): boolean {
  if (access.kind === 'owner') {
    return true;
  }
  if (access.kind === 'participant') {
    return (
      access.role === GovernanceRole.Syndic ||
      access.role === GovernanceRole.SubSyndic ||
      access.role === GovernanceRole.Admin
    );
  }
  return false;
}
