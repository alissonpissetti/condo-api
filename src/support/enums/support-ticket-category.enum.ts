/**
 * Categoria da solicitação.
 * Valores `bug`…`other`: pedido à **plataforma** Meu Condomínio.
 * Valores `condo_*`: pedido ao **condomínio** (gestão / síndico).
 */
export enum SupportTicketCategory {
  Bug = 'bug',
  Correction = 'correction',
  Feature = 'feature',
  Improvement = 'improvement',
  Other = 'other',
  CondoComplaint = 'condo_complaint',
  CondoRequest = 'condo_request',
  CondoOrder = 'condo_order',
  CondoInformation = 'condo_information',
  CondoAgendaSuggestion = 'condo_agenda_suggestion',
  CondoOther = 'condo_other',
}

