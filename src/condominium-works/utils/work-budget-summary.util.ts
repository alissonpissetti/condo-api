import { WorkBudgetStatus } from '../enums/work-budget-status.enum';

export function formatBudgetTimelineSummary(
  supplierName: string,
  amountCents: number,
  status: WorkBudgetStatus,
  formatCents: (cents: number) => string,
  title?: string | null,
): string {
  const subject = title?.trim()
    ? `${title.trim()} · ${supplierName}`
    : supplierName;
  if (
    status === WorkBudgetStatus.AwaitingBudget ||
    (amountCents <= 0 && status !== WorkBudgetStatus.Approved)
  ) {
    return `Orçamento: ${subject} — aguardando`;
  }
  return `Orçamento: ${subject} — ${formatCents(amountCents)}`;
}
