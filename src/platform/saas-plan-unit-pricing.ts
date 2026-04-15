import { BadRequestException } from '@nestjs/common';

/** Faixa inclusiva [minUnits, maxUnits]; `maxUnits === null` = sem limite superior (só na última faixa). */
export type SaasPlanPriceTier = {
  minUnits: number;
  maxUnits: number | null;
  pricePerUnitCents: number;
};

export function cloneSortedTiers(
  tiers: SaasPlanPriceTier[],
): SaasPlanPriceTier[] {
  return [...tiers].sort((a, b) => a.minUnits - b.minUnits);
}

export function assertValidUnitPriceTiers(tiers: SaasPlanPriceTier[]): void {
  if (tiers.length === 0) {
    return;
  }
  const t = cloneSortedTiers(tiers);
  if (t[0].minUnits !== 1) {
    throw new BadRequestException(
      'A primeira faixa deve ter minUnits = 1 (a contagem de unidades começa em 1).',
    );
  }
  for (let i = 0; i < t.length; i++) {
    const cur = t[i];
    if (cur.maxUnits != null && cur.maxUnits < cur.minUnits) {
      throw new BadRequestException(
        'Em cada faixa, maxUnits não pode ser menor que minUnits.',
      );
    }
    if (cur.pricePerUnitCents < 0) {
      throw new BadRequestException('Preço por unidade não pode ser negativo.');
    }
    if (i < t.length - 1) {
      if (cur.maxUnits === null) {
        throw new BadRequestException(
          'Só a última faixa pode ter maxUnits indefinido (null).',
        );
      }
      const next = t[i + 1];
      if (next.minUnits !== cur.maxUnits + 1) {
        throw new BadRequestException(
          `Faixas devem ser contíguas: após unidades ${cur.minUnits}–${cur.maxUnits}, a próxima faixa deve começar em ${cur.maxUnits + 1} (recebido ${next.minUnits}).`,
        );
      }
    } else if (cur.maxUnits !== null) {
      throw new BadRequestException(
        'A última faixa deve ter maxUnits = null para cobrir todas as unidades acima do limite anterior.',
      );
    }
  }
}

/** Normaliza DTO cru (remove espaços, garante null no fim). */
export function normalizeTiersFromInput(
  raw: Array<{
    minUnits: number;
    maxUnits?: number | null;
    pricePerUnitCents: number;
  }>,
): SaasPlanPriceTier[] {
  return raw.map((r) => ({
    minUnits: Math.floor(Number(r.minUnits)),
    maxUnits:
      r.maxUnits === undefined || r.maxUnits === null
        ? null
        : Math.floor(Number(r.maxUnits)),
    pricePerUnitCents: Math.floor(Number(r.pricePerUnitCents)),
  }));
}

/**
 * Preço por unidade aplicável quando o condomínio tem `unitCount` unidades
 * (todas as unidades pagam a mesma tarifa da faixa correspondente).
 */
export function resolvePricePerUnitForUnitCount(
  legacyPricePerUnitCents: number,
  tiers: SaasPlanPriceTier[] | null | undefined,
  unitCount: number,
): number {
  const nLookup = unitCount < 1 ? 1 : unitCount;
  if (!tiers?.length) {
    return legacyPricePerUnitCents;
  }
  const t = cloneSortedTiers(tiers);
  for (const row of t) {
    if (
      nLookup >= row.minUnits &&
      (row.maxUnits == null || nLookup <= row.maxUnits)
    ) {
      return row.pricePerUnitCents;
    }
  }
  return legacyPricePerUnitCents;
}
