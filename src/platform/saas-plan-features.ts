/**
 * Conjunto canônico de «recursos» do painel que podem ser habilitados/bloqueados
 * por plano. Cada chave corresponde a uma entrada do menu lateral no `condo-web`.
 * A lista é compartilhada com o admin da plataforma (`condo-adm`) e com o
 * frontend do painel para mostrar cadeados/redirecionamentos para upgrade.
 */
export const SAAS_PLAN_FEATURE_KEYS = [
  'editCondominium',
  'units',
  'invitations',
  'members',
  'unitShortcuts',
  'financialTransactions',
  'financialStatement',
  'funds',
  'condoFees',
  'planning',
  'documents',
] as const;

export type SaasPlanFeatureKey = (typeof SAAS_PLAN_FEATURE_KEYS)[number];

export type SaasPlanFeatures = Record<SaasPlanFeatureKey, boolean>;

/**
 * Rótulo curto (pt-BR) de cada recurso. Usado no admin e, opcionalmente, na
 * tela de upgrade. Mantido junto da lista canônica para ficar sincronizado.
 */
export const SAAS_PLAN_FEATURE_LABELS: Record<SaasPlanFeatureKey, string> = {
  editCondominium: 'Editar condomínio',
  units: 'Unidades',
  invitations: 'Convites',
  members: 'Membros',
  unitShortcuts: 'Atalhos por unidade',
  financialTransactions: 'Transações financeiras',
  financialStatement: 'Extrato',
  funds: 'Fundos',
  condoFees: 'Taxas condominiais',
  planning: 'Pautas / planejamento',
  documents: 'Documentos',
};

/** Plano sem restrição: todas as features ficam habilitadas. */
export function defaultSaasPlanFeatures(): SaasPlanFeatures {
  const out = {} as SaasPlanFeatures;
  for (const k of SAAS_PLAN_FEATURE_KEYS) {
    out[k] = true;
  }
  return out;
}

/**
 * Normaliza o JSON vindo do banco / DTO: ignora chaves desconhecidas, força
 * booleanos, preenche chaves ausentes com `true` (compatibilidade com planos
 * legados criados antes desta coluna).
 */
export function normalizeSaasPlanFeatures(
  raw: Partial<Record<string, unknown>> | null | undefined,
): SaasPlanFeatures {
  const out = defaultSaasPlanFeatures();
  if (!raw || typeof raw !== 'object') {
    return out;
  }
  for (const k of SAAS_PLAN_FEATURE_KEYS) {
    const v = raw[k];
    if (typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}
