/** Escopo global de categorias de fornecedor (visível em todos os condomínios). */
export const SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID = '0';

export const DEFAULT_SUPPLIER_CATEGORIES: ReadonlyArray<{
  id: string;
  name: string;
}> = [
  {
    id: 'a1000001-0000-4000-8000-000000000001',
    name: 'Construção civil',
  },
  {
    id: 'a1000001-0000-4000-8000-000000000002',
    name: 'Elétrica',
  },
  {
    id: 'a1000001-0000-4000-8000-000000000003',
    name: 'Hidráulica',
  },
  {
    id: 'a1000001-0000-4000-8000-000000000004',
    name: 'Pintura e acabamento',
  },
  {
    id: 'a1000001-0000-4000-8000-000000000005',
    name: 'Marcenaria e serralheria',
  },
  {
    id: 'a1000001-0000-4000-8000-000000000006',
    name: 'Jardinagem e paisagismo',
  },
  {
    id: 'a1000001-0000-4000-8000-000000000007',
    name: 'Limpeza e conservação',
  },
  {
    id: 'a1000001-0000-4000-8000-000000000008',
    name: 'Segurança e portaria',
  },
  {
    id: 'a1000001-0000-4000-8000-000000000009',
    name: 'Elevadores e manutenção predial',
  },
  {
    id: 'a1000001-0000-4000-8000-00000000000a',
    name: 'Outros',
  },
] as const;
