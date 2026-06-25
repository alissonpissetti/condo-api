import { BadRequestException } from '@nestjs/common';
import { WorkBudgetStatus } from '../enums/work-budget-status.enum';
import type { CreateWorkBudgetDto } from './create-work-budget.dto';

function parseAmountCents(raw: unknown): number | null {
  const amountStr =
    typeof raw === 'string'
      ? raw
      : typeof raw === 'number'
        ? String(raw)
        : '';
  if (!amountStr.trim()) {
    return null;
  }
  const amountCents = Number.parseInt(amountStr, 10);
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    return null;
  }
  return amountCents;
}

/** Converte campos multipart (strings) em DTO de orçamento. */
export function parseCreateWorkBudgetBody(
  body: Record<string, unknown>,
): CreateWorkBudgetDto {
  const supplierId =
    typeof body.supplierId === 'string' && body.supplierId.trim()
      ? body.supplierId.trim()
      : undefined;
  const supplierName =
    typeof body.supplierName === 'string' ? body.supplierName.trim() : '';
  if (!supplierId && !supplierName) {
    throw new BadRequestException(
      'Informe o fornecedor ou selecione um cadastrado.',
    );
  }

  let status = WorkBudgetStatus.AwaitingBudget;
  if (typeof body.status === 'string' && body.status.trim()) {
    const s = body.status.trim() as WorkBudgetStatus;
    if (!Object.values(WorkBudgetStatus).includes(s)) {
      throw new BadRequestException('Status de orçamento inválido.');
    }
    status = s;
  }

  const parsedAmount = parseAmountCents(body.amountCents);
  let amountCents = 0;
  if (status === WorkBudgetStatus.AwaitingBudget) {
    amountCents = parsedAmount ?? 0;
  } else {
    if (parsedAmount === null) {
      throw new BadRequestException('Informe um valor válido.');
    }
    if (parsedAmount <= 0 && status === WorkBudgetStatus.UnderReview) {
      throw new BadRequestException('Informe o valor do orçamento recebido.');
    }
    amountCents = parsedAmount;
  }

  let validUntil: string | undefined;
  if (typeof body.validUntil === 'string' && body.validUntil.trim()) {
    validUntil = body.validUntil.trim();
  }
  const notes =
    typeof body.notes === 'string' && body.notes.trim()
      ? body.notes.trim()
      : undefined;
  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : undefined;
  let recordedOn: string | undefined;
  if (typeof body.recordedOn === 'string' && body.recordedOn.trim()) {
    recordedOn = body.recordedOn.trim();
  }
  let scheduledAt: string | undefined;
  if (typeof body.scheduledAt === 'string' && body.scheduledAt.trim()) {
    scheduledAt = body.scheduledAt.trim();
  }
  return {
    supplierId,
    supplierName: supplierName || undefined,
    amountCents,
    validUntil,
    scheduledAt,
    status,
    notes,
    title,
    recordedOn,
  };
}
