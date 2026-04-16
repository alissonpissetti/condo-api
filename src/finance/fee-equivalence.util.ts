/**
 * Chave para homogeneizar taxa / exibição: unidades com o mesmo nome de
 * agrupamento (normalizado) tratam-se como mesmas condições. Nome vazio →
 * `groupingId`.
 */
export function groupingFeeEquivalenceKey(
  groupingName: string | null | undefined,
  groupingId: string,
): string {
  const collapsed = (groupingName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return collapsed.length > 0 ? collapsed : groupingId;
}
