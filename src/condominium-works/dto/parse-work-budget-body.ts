import { BadRequestException } from '@nestjs/common';
import { WorkBudgetStatus } from '../enums/work-budget-status.enum';
import type { CreateWorkBudgetDto } from './create-work-budget.dto';

/** Converte campos multipart (strings) em DTO de orçamento. */
export function parseCreateWorkBudgetBody(
  body: Record<string, unknown>,
): CreateWorkBudgetDto {
  const supplierName =
    typeof body.supplierName === 'string' ? body.supplierName.trim() : '';
  if (!supplierName) {
    throw new BadRequestException('Informe o fornecedor.');
  }
  const rawAmount = body.amountCents;
  const amountStr =
    typeof rawAmount === 'string'
      ? rawAmount
      : typeof rawAmount === 'number'
        ? String(rawAmount)
        : '';
  const amountCents = Number.parseInt(amountStr, 10);
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    throw new BadRequestException('Informe um valor válido.');
  }
  let validUntil: string | undefined;
  if (typeof body.validUntil === 'string' && body.validUntil.trim()) {
    validUntil = body.validUntil.trim();
  }
  let status: WorkBudgetStatus | undefined;
  if (typeof body.status === 'string' && body.status.trim()) {
    const s = body.status.trim() as WorkBudgetStatus;
    if (!Object.values(WorkBudgetStatus).includes(s)) {
      throw new BadRequestException('Status de orçamento inválido.');
    }
    status = s;
  }
  const notes =
    typeof body.notes === 'string' && body.notes.trim()
      ? body.notes.trim()
      : undefined;
  let recordedOn: string | undefined;
  if (typeof body.recordedOn === 'string' && body.recordedOn.trim()) {
    recordedOn = body.recordedOn.trim();
  }
  return {
    supplierName,
    amountCents,
    validUntil,
    status,
    notes,
    recordedOn,
  };
}
