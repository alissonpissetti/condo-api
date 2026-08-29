export type OpenChargeForCredit = {
  id: string;
  competenceYm: string;
  amountDueCents: string;
};

/** Aplica crédito FIFO (competência mais antiga primeiro) sobre cobranças em aberto. */
export function allocateUnitCreditFifo(
  openCharges: OpenChargeForCredit[],
  creditBalance: bigint,
): Map<string, bigint> {
  const alloc = new Map<string, bigint>();
  if (creditBalance <= 0n || openCharges.length === 0) {
    return alloc;
  }
  let remaining = creditBalance;
  const sorted = [...openCharges].sort((a, b) =>
    a.competenceYm.localeCompare(b.competenceYm),
  );
  for (const ch of sorted) {
    if (remaining <= 0n) {
      break;
    }
    const due = BigInt(String(ch.amountDueCents));
    if (due <= 0n) {
      continue;
    }
    const apply = remaining >= due ? due : remaining;
    if (apply > 0n) {
      alloc.set(ch.id, apply);
      remaining -= apply;
    }
  }
  return alloc;
}

export function netDueAfterCredit(
  amountDueCents: bigint,
  creditAppliedCents: bigint,
): bigint {
  const net = amountDueCents - creditAppliedCents;
  return net > 0n ? net : 0n;
}
