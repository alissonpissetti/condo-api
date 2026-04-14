export enum GovernanceRole {
  Owner = 'owner',
  Syndic = 'syndic',
  /** Suplente / vice do síndico; permissões alinhadas ao administrador (exceto trocar síndico). */
  SubSyndic = 'sub_syndic',
  Admin = 'admin',
  /** Membro com acesso ao condomínio (onboarding por convite, sem papel de gestão). */
  Member = 'member',
}
