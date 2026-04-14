import { BadRequestException } from '@nestjs/common';

/** Partes inteiras positivas que somam `total` (resto distribuído 1 a 1 nas primeiras unidades). */
export function distributePositiveCents(
  total: bigint,
  count: number,
): bigint[] {
  if (count <= 0) {
    throw new BadRequestException('Allocation requires at least one unit');
  }
  if (total <= 0n) {
    throw new BadRequestException('Amount must be positive');
  }
  const base = total / BigInt(count);
  const rem = Number(total % BigInt(count));
  const out: bigint[] = [];
  for (let i = 0; i < count; i++) {
    out.push(base + (i < rem ? 1n : 0n));
  }
  return out;
}
