import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estado de quitação das transações financeiras (taxas condominiais consideram
 * apenas lançamentos em «aguardando» / pending).
 *
 * Dados históricos com data de ocorrência anterior a 2025-04-30 passam a «pago»
 * para não permanecerem no saldo de cobrança após a migração.
 */
export class FinancialTransactionPaymentStatus1751420000000
  implements MigrationInterface
{
  name = 'FinancialTransactionPaymentStatus1751420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const table = 'financial_transactions';
    const col = 'payment_status';

    const hasCol = await queryRunner.hasColumn(table, col);
    if (!hasCol) {
      if (dialect === 'postgres') {
        await queryRunner.query(`
ALTER TABLE "financial_transactions"
  ADD "payment_status" varchar(16) NOT NULL DEFAULT 'pending'
`);
        await queryRunner.query(`
CREATE INDEX "IDX_fin_tx_payment_status"
  ON "financial_transactions" ("payment_status")
`);
      } else {
        await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
  ADD \`payment_status\` varchar(16) NOT NULL DEFAULT 'pending'
`);
        await queryRunner.query(`
CREATE INDEX \`IDX_fin_tx_payment_status\`
  ON \`financial_transactions\` (\`payment_status\`)
`);
      }
    }

    const cutoff = '2025-04-30';
    if (dialect === 'postgres') {
      await queryRunner.query(
        `
UPDATE "financial_transactions"
SET "payment_status" = 'paid'
WHERE "occurred_on" < $1::date
`,
        [cutoff],
      );
    } else {
      await queryRunner.query(
        `
UPDATE \`financial_transactions\`
SET \`payment_status\` = 'paid'
WHERE \`occurred_on\` < ?
`,
        [cutoff],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const table = 'financial_transactions';
    const col = 'payment_status';
    const hasCol = await queryRunner.hasColumn(table, col);
    if (!hasCol) {
      return;
    }
    if (dialect === 'postgres') {
      await queryRunner.query(`
DROP INDEX IF EXISTS "IDX_fin_tx_payment_status"
`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions" DROP COLUMN "payment_status"
`);
    } else {
      await queryRunner.query(`
DROP INDEX \`IDX_fin_tx_payment_status\` ON \`financial_transactions\`
`);
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\` DROP COLUMN \`payment_status\`
`);
    }
  }
}
