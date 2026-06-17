export function compareSupplierCategoryName(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

export function sortSupplierCategoriesByName<T extends { name: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) =>
    compareSupplierCategoryName(a.name, b.name),
  );
}
