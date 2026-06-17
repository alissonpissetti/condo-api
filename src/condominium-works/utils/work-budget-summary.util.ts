import { WorkBudgetStatus } from '../enums/work-budget-status.enum';

export function formatBudgetTimelineSummary(
  supplierName: string,
  amountCents: number,
  status: WorkBudgetStatus,
  formatCents: (cents: number) => string,
): string {
  if (
    status === WorkBudgetStatus.AwaitingBudget ||
    (amountCents <= 0 && status !== WorkBudgetStatus.Approved)
  ) {
    return `Orçamento: ${supplierName} — aguardando`;
  }
  return `Orçamento: ${supplierName} — ${formatCents(amountCents)}`;
}
