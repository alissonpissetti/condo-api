import { WorkBudgetStatus } from './enums/work-budget-status.enum';
import { WorkStatus } from './enums/work-status.enum';

const WORK_STATUS_LABELS_PT: Record<WorkStatus, string> = {
  [WorkStatus.Planned]: 'Planejada',
  [WorkStatus.InProgress]: 'Em andamento',
  [WorkStatus.Completed]: 'Concluída',
  [WorkStatus.Cancelled]: 'Cancelada',
};

const BUDGET_STATUS_LABELS_PT: Record<WorkBudgetStatus, string> = {
  [WorkBudgetStatus.Received]: 'Recebido',
  [WorkBudgetStatus.UnderReview]: 'Em análise',
  [WorkBudgetStatus.Approved]: 'Aprovado',
  [WorkBudgetStatus.Rejected]: 'Rejeitado',
};

export function workStatusLabelPt(status: WorkStatus): string {
  return WORK_STATUS_LABELS_PT[status] ?? status;
}

export function workBudgetStatusLabelPt(status: WorkBudgetStatus): string {
  return BUDGET_STATUS_LABELS_PT[status] ?? status;
}

export function buildWorkCreateAuditBody(status: WorkStatus): string {
  return `Obra criada com status «${workStatusLabelPt(status)}».`;
}

export function buildWorkUpdateAuditBody(input: {
  previousTitle: string;
  previousDescription: string | null;
  previousStatus: WorkStatus;
  nextTitle?: string;
  nextDescription?: string | null;
  nextStatus?: WorkStatus;
}): string | null {
  const lines: string[] = [];
  if (
    input.nextTitle !== undefined &&
    input.nextTitle.trim() !== input.previousTitle.trim()
  ) {
    lines.push(
      `Título alterado de «${input.previousTitle.trim()}» para «${input.nextTitle.trim()}».`,
    );
  }
  if (input.nextDescription !== undefined) {
    const oldDesc = (input.previousDescription ?? '').trim();
    const newDesc = (input.nextDescription ?? '').trim();
    if (oldDesc !== newDesc) {
      if (!oldDesc && newDesc) {
        lines.push('Descrição adicionada.');
      } else if (oldDesc && !newDesc) {
        lines.push('Descrição removida.');
      } else {
        lines.push('Descrição atualizada.');
      }
    }
  }
  if (
    input.nextStatus !== undefined &&
    input.nextStatus !== input.previousStatus
  ) {
    lines.push(
      `Status alterado de «${workStatusLabelPt(input.previousStatus)}» para «${workStatusLabelPt(input.nextStatus)}».`,
    );
  }
  return lines.length ? lines.join('\n') : null;
}

export function buildBudgetUpdateAuditBody(input: {
  supplierName: string;
  previous: {
    supplierName: string;
    amountCents: number;
    validUntil: string | null;
    status: WorkBudgetStatus;
    notes: string | null;
  };
  next: {
    supplierName?: string;
    amountCents?: number;
    validUntil?: string | null;
    status?: WorkBudgetStatus;
    notes?: string | null;
  };
  formatCents: (cents: number) => string;
}): string | null {
  const lines: string[] = [];
  const p = input.previous;
  const n = input.next;
  if (
    n.supplierName !== undefined &&
    n.supplierName.trim() !== p.supplierName.trim()
  ) {
    lines.push(
      `Fornecedor alterado de «${p.supplierName.trim()}» para «${n.supplierName.trim()}».`,
    );
  }
  if (n.amountCents !== undefined && n.amountCents !== p.amountCents) {
    lines.push(
      `Valor alterado de ${input.formatCents(p.amountCents)} para ${input.formatCents(n.amountCents)}.`,
    );
  }
  if (n.validUntil !== undefined) {
    const oldV = (p.validUntil ?? '').trim();
    const newV = (n.validUntil ?? '').trim();
    if (oldV !== newV) {
      if (!oldV && newV) {
        lines.push(`Validade definida para ${newV}.`);
      } else if (oldV && !newV) {
        lines.push('Validade removida.');
      } else {
        lines.push(`Validade alterada de ${oldV} para ${newV}.`);
      }
    }
  }
  if (n.status !== undefined && n.status !== p.status) {
    lines.push(
      `Status do orçamento alterado de «${workBudgetStatusLabelPt(p.status)}» para «${workBudgetStatusLabelPt(n.status)}».`,
    );
  }
  if (n.notes !== undefined) {
    const oldNotes = (p.notes ?? '').trim();
    const newNotes = (n.notes ?? '').trim();
    if (oldNotes !== newNotes) {
      if (!oldNotes && newNotes) {
        lines.push('Observações adicionadas.');
      } else if (oldNotes && !newNotes) {
        lines.push('Observações removidas.');
      } else {
        lines.push('Observações atualizadas.');
      }
    }
  }
  if (!lines.length) {
    return null;
  }
  const head = `Orçamento «${input.supplierName.trim()}»:`;
  return `${head}\n${lines.join('\n')}`;
}
