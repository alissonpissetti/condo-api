export enum WorkTimelineKind {
  Note = 'note',
  Document = 'document',
  Budget = 'budget',
  Transaction = 'transaction',
  /** Contrato ou documento jurídico (ex.: contrato assinado do projeto). */
  Legal = 'legal',
  /** Alteração nos dados da obra ou de orçamento (auditoria). */
  Edit = 'edit',
}
