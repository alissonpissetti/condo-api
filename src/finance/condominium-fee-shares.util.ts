import type { FinancialTransaction } from './entities/financial-transaction.entity';
import { distributePositiveCents } from './distribute-cents';
import { groupingFeeEquivalenceKey } from './fee-equivalence.util';

export type FeeUnitRef = {
  unitId: string;
  groupingId: string;
  groupingName: string;
  feeEquivalenceKey: string;
};

/** Fundo permanente tratado como reserva (nome contém «reserva»). */
export function isReservaFundName(name: string | null | undefined): boolean {
  const n = (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return n.includes('reserva');
}

/**
 * Despesas/aplicações que entram na taxa condominial: conta geral e fundos permanentes
 * (exceto reserva); sem transferências nem gastos em fundos obra/reserva nem obras (timeline).
 * Despesas vinculadas a manutenções na conta geral entram no rateio mensal.
 */
export function isExpenseIncludedInCondominiumFee(
  t: Pick<
    FinancialTransaction,
    'transferGroupId' | 'workId' | 'title' | 'fund'
  >,
): boolean {
  if (t.transferGroupId?.trim()) {
    return false;
  }
  if (t.workId?.trim()) {
    return false;
  }
  const titleNorm = (t.title ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (titleNorm.startsWith('transferencia:')) {
    return false;
  }
  const fund = t.fund;
  if (fund) {
    if (!fund.isPermanent) {
      return false;
    }
    if (isReservaFundName(fund.name)) {
      return false;
    }
  }
  return true;
}

function absShareCents(shareCents: string | bigint): bigint {
  const v = BigInt(String(shareCents));
  return v < 0n ? -v : v;
}

function distributeSignedRounding(delta: bigint, byUnit: bigint[]): bigint[] {
  const out = byUnit.map(() => 0n);
  if (delta === 0n) {
    return out;
  }
  const targets = byUnit
    .map((v, i) => (v > 0n ? i : -1))
    .filter((i): i is number => i >= 0);
  const useIdx =
    targets.length > 0 ? targets : byUnit.map((_, i) => i);
  const absD = delta < 0n ? -delta : delta;
  const sign = delta < 0n ? -1n : 1n;
  const parts = distributePositiveCents(absD, useIdx.length);
  for (let k = 0; k < useIdx.length; k++) {
    out[useIdx[k]!] = sign * parts[k]!;
  }
  return out;
}

function addExtratoRowDeltaPreservingGroups(
  delta: bigint,
  out: bigint[],
  unitRefs: FeeUnitRef[],
  participatingIdx: number[],
): void {
  if (delta <= 0n) {
    return;
  }
  const byKey = new Map<string, number[]>();
  for (const i of participatingIdx) {
    const u = unitRefs[i]!;
    const arr = byKey.get(u.feeEquivalenceKey) ?? [];
    arr.push(i);
    byKey.set(u.feeEquivalenceKey, arr);
  }
  const classes = [...byKey.values()].filter((c) => c.length > 0);
  let d = delta;
  let guard = 0;
  while (d > 0n && guard++ < 10_000) {
    let moved = false;
    const sorted = [...classes].sort((a, b) => a.length - b.length);
    for (const idxs of sorted) {
      const n = BigInt(idxs.length);
      if (d >= n) {
        for (const i of idxs) {
          out[i] = out[i]! + 1n;
        }
        d -= n;
        moved = true;
        break;
      }
    }
    if (!moved) {
      break;
    }
  }
  if (d > 0n) {
    const adj = distributeSignedRounding(d, out);
    for (let i = 0; i < out.length; i++) {
      out[i] = out[i]! + adj[i]!;
    }
  }
}

/**
 * Por lançamento: cotas absolutas por unidade, niveladas ao máximo dentro de cada
 * agrupamento (mesma regra do extrato PDF).
 */
export function equalizeTransactionFeeShares(
  unitRefs: FeeUnitRef[],
  declaredTotalCents: bigint,
  rawByUnitIndex: bigint[],
  participatingIdx: number[],
): bigint[] {
  const out = [...rawByUnitIndex];
  if (participatingIdx.length === 0) {
    return out;
  }
  const byKey = new Map<string, number[]>();
  for (const i of participatingIdx) {
    const u = unitRefs[i]!;
    const arr = byKey.get(u.feeEquivalenceKey) ?? [];
    arr.push(i);
    byKey.set(u.feeEquivalenceKey, arr);
  }
  for (const idxs of byKey.values()) {
    let mx = 0n;
    for (const i of idxs) {
      if (out[i]! > mx) {
        mx = out[i]!;
      }
    }
    for (const i of idxs) {
      out[i] = mx;
    }
  }
  const sum = out.reduce((a, b) => a + b, 0n);
  const delta = declaredTotalCents - sum;
  if (delta > 0n) {
    addExtratoRowDeltaPreservingGroups(
      delta,
      out,
      unitRefs,
      participatingIdx,
    );
  }
  return out;
}

function transactionRawSharesByUnitIndex(
  t: FinancialTransaction,
  unitRefs: FeeUnitRef[],
): { declared: bigint; byUnit: bigint[]; participatingIdx: number[] } {
  const shareMap = new Map<string, bigint>();
  for (const s of t.unitShares ?? []) {
    const abs = absShareCents(s.shareCents);
    shareMap.set(s.unitId, (shareMap.get(s.unitId) ?? 0n) + abs);
  }
  const byUnit: bigint[] = [];
  const participatingIdx: number[] = [];
  for (let i = 0; i < unitRefs.length; i++) {
    const u = unitRefs[i]!;
    const v = shareMap.get(u.unitId) ?? 0n;
    byUnit.push(v);
    if (v > 0n) {
      participatingIdx.push(i);
    }
  }
  if (participatingIdx.length === 0) {
    for (let i = 0; i < unitRefs.length; i++) {
      if (shareMap.has(unitRefs[i]!.unitId)) {
        participatingIdx.push(i);
      }
    }
  }
  return {
    declared: BigInt(String(t.amountCents)),
    byUnit,
    participatingIdx,
  };
}

/** Soma, por unidade, as cotas niveladas de cada lançamento elegível. */
export function sumEqualizedFeeSharesByUnit(
  transactions: FinancialTransaction[],
  unitRefs: FeeUnitRef[],
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const u of unitRefs) {
    out.set(u.unitId, 0n);
  }
  for (const t of transactions) {
    const { declared, byUnit, participatingIdx } =
      transactionRawSharesByUnitIndex(t, unitRefs);
    const idxs =
      participatingIdx.length > 0
        ? participatingIdx
        : unitRefs.map((_, i) => i);
    const equalized = equalizeTransactionFeeShares(
      unitRefs,
      declared,
      byUnit,
      idxs,
    );
    for (let i = 0; i < unitRefs.length; i++) {
      const u = unitRefs[i]!;
      const add = equalized[i] ?? 0n;
      if (add !== 0n) {
        out.set(u.unitId, (out.get(u.unitId) ?? 0n) + add);
      }
    }
  }
  return out;
}
