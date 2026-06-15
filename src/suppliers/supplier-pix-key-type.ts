/** Tipos de chave PIX (Bacen / mercado). */
export const SUPPLIER_PIX_KEY_TYPES = [
  'cpf',
  'cnpj',
  'email',
  'phone',
  'random',
] as const;

export type SupplierPixKeyType = (typeof SUPPLIER_PIX_KEY_TYPES)[number];

export function isSupplierPixKeyType(v: string): v is SupplierPixKeyType {
  return (SUPPLIER_PIX_KEY_TYPES as readonly string[]).includes(v);
}
