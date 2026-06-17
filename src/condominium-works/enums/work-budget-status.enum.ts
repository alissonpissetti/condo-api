export enum WorkBudgetStatus {
  /** Visita agendada; orçamento ainda não recebido. */
  AwaitingBudget = 'awaiting_budget',
  Received = 'received',
  UnderReview = 'under_review',
  Approved = 'approved',
  Rejected = 'rejected',
}
