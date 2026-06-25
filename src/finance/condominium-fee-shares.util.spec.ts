import type { FinancialTransaction } from './entities/financial-transaction.entity';
import {
  isExpenseIncludedInCondominiumFee,
  sumEqualizedFeeSharesByUnit,
  type FeeUnitRef,
} from './condominium-fee-shares.util';

function unit(
  id: string,
  groupingId: string,
  groupingName: string,
): FeeUnitRef {
  return {
    unitId: id,
    groupingId,
    groupingName,
    feeEquivalenceKey: groupingName.toLowerCase(),
  };
}

function tx(
  partial: Partial<FinancialTransaction> & {
    amountCents: string;
    unitShares: { unitId: string; shareCents: string }[];
  },
): FinancialTransaction {
  return {
    transferGroupId: null,
    workId: null,
    maintenanceId: null,
    title: 'Teste',
    fund: null,
    ...partial,
  } as FinancialTransaction;
}

describe('isExpenseIncludedInCondominiumFee', () => {
  it('exclui transação vinculada a obra', () => {
    expect(
      isExpenseIncludedInCondominiumFee({
        transferGroupId: null,
        workId: 'obra-1',
        maintenanceId: null,
        title: 'Despesa obra',
        fund: null,
      }),
    ).toBe(false);
  });

  it('inclui transação vinculada a manutenção na conta geral', () => {
    expect(
      isExpenseIncludedInCondominiumFee({
        transferGroupId: null,
        workId: null,
        title: 'Despesa manutenção portão',
        fund: null,
      }),
    ).toBe(true);
  });
});

describe('sumEqualizedFeeSharesByUnit', () => {
  const units: FeeUnitRef[] = [
    unit('ext1', 'g1', 'Externos'),
    unit('ext2', 'g1', 'Externos'),
    unit('int1', 'g2', 'Internos'),
    unit('int2', 'g2', 'Internos'),
  ];

  it('não soma despesa de obra na taxa', () => {
    const obra = tx({
      workId: 'obra-1',
      amountCents: '800000',
      unitShares: units.map((u) => ({
        unitId: u.unitId,
        shareCents: '200000',
      })),
    });
    const fund = tx({
      kind: 'income',
      amountCents: '70000',
      unitShares: [
        { unitId: 'int1', shareCents: '-35000' },
        { unitId: 'int2', shareCents: '-35000' },
      ],
    });
    const sums = sumEqualizedFeeSharesByUnit([fund], units);
    expect(sums.get('int1')).toBe(35000n);
    expect(sums.get('int2')).toBe(35000n);
    expect(sums.get('ext1')).toBe(0n);
    expect(sums.get('ext2')).toBe(0n);
  });

  it('soma despesa de manutenção na conta geral', () => {
    const manut = tx({
      maintenanceId: 'manut-portao',
      amountCents: '40000',
      unitShares: units.map((u) => ({
        unitId: u.unitId,
        shareCents: '10000',
      })),
    });
    const sums = sumEqualizedFeeSharesByUnit([manut], units);
    expect(sums.get('ext1')).toBe(10000n);
    expect(sums.get('int2')).toBe(10000n);
  });

  it('soma despesa geral rateada e mensalidade de fundo', () => {
    const despesa = tx({
      amountCents: '800000',
      unitShares: units.map((u) => ({
        unitId: u.unitId,
        shareCents: '200000',
      })),
    });
    const fund = tx({
      kind: 'income',
      amountCents: '70000',
      unitShares: [
        { unitId: 'int1', shareCents: '-35000' },
        { unitId: 'int2', shareCents: '-35000' },
      ],
    });
    const sums = sumEqualizedFeeSharesByUnit([despesa, fund], units);
    expect(sums.get('int1')).toBe(235000n);
    expect(sums.get('int2')).toBe(235000n);
    expect(sums.get('ext1')).toBe(200000n);
    expect(sums.get('ext2')).toBe(200000n);
  });
});
