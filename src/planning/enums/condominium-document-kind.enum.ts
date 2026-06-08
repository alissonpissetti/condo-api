export enum CondominiumDocumentKind {
  AssemblyMinutesDraft = 'assembly_minutes_draft',
  AssemblyMinutesFinal = 'assembly_minutes_final',
  /** Lista de presença para impressão e assinatura (assembleia vinculada à pauta). */
  AssemblyAttendanceSheet = 'assembly_attendance_sheet',
  /** Ata de reunião administrativa (modelo sem pauta de votação no sistema). */
  MeetingMinutesDraft = 'meeting_minutes_draft',
  MeetingMinutesFinal = 'meeting_minutes_final',
}
