import { BadRequestException } from '@nestjs/common';
import {
  isSupplierPixKeyType,
  type SupplierPixKeyType,
} from './supplier-pix-key-type';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizePixPair(
  pixKeyType: string | null | undefined,
  pixKeyValue: string | null | undefined,
): { pixKeyType: SupplierPixKeyType | null; pixKeyValue: string | null } {
  const t = pixKeyType?.trim() || '';
  const v = pixKeyValue?.trim() || '';
  if (!t && !v) {
    return { pixKeyType: null, pixKeyValue: null };
  }
  if (!t || !v) {
    throw new BadRequestException(
      'Chave PIX: informe o tipo e o valor juntos, ou deixe os dois em branco.',
    );
  }
  if (!isSupplierPixKeyType(t)) {
    throw new BadRequestException(
      'Tipo de chave PIX inválido. Use: cpf, cnpj, email, phone ou random.',
    );
  }
  validatePixValue(t, v);
  return { pixKeyType: t, pixKeyValue: v };
}

export function validatePixValue(kind: SupplierPixKeyType, raw: string): void {
  const value = raw.trim();
  switch (kind) {
    case 'cpf': {
      const d = value.replace(/\D/g, '');
      if (d.length !== 11) {
        throw new BadRequestException('Chave PIX CPF: use 11 dígitos.');
      }
      return;
    }
    case 'cnpj': {
      const d = value.replace(/\D/g, '');
      if (d.length !== 14) {
        throw new BadRequestException('Chave PIX CNPJ: use 14 dígitos.');
      }
      return;
    }
    case 'email': {
      if (!EMAIL_RE.test(value) || value.length > 77) {
        throw new BadRequestException('Chave PIX e-mail inválida.');
      }
      return;
    }
    case 'phone': {
      const d = value.replace(/\D/g, '');
      if (d.length < 10 || d.length > 13) {
        throw new BadRequestException(
          'Chave PIX telefone: use 10 a 13 dígitos (com DDD; opcional 55).',
        );
      }
      return;
    }
    case 'random': {
      if (!UUID_RE.test(value)) {
        throw new BadRequestException(
          'Chave PIX aleatória: informe um UUID válido.',
        );
      }
      return;
    }
    default:
      throw new BadRequestException('Tipo de chave PIX inválido.');
  }
}

export function normalizeDocumentCnpjCpf(
  raw: string | null | undefined,
): string | null {
  if (raw == null || !String(raw).trim()) {
    return null;
  }
  const d = String(raw).replace(/\D/g, '');
  if (d.length !== 11 && d.length !== 14) {
    throw new BadRequestException(
      'CPF/CNPJ: informe 11 dígitos (CPF) ou 14 (CNPJ), ou deixe em branco.',
    );
  }
  return d;
}
