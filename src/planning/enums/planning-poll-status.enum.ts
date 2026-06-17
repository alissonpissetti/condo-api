export enum PlanningPollStatus {
  Draft = 'draft',
  Open = 'open',
  Closed = 'closed',
  Decided = 'decided',
  /** Reunião inconclusiva: matéria prorrogada para nova deliberação. */
  Postponed = 'postponed',
  /** Reunião inconclusiva: sem necessidade de manter a pauta. */
  Withdrawn = 'withdrawn',
}
