import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionRecurringSeries1750300000000
  implements MigrationInterface
{
  name = 'TransactionRecurringSeries1750300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
  ADD COLUMN "recurring_series_id" varchar(36) NULL
`);
      await queryRunner.query(`
CREATE INDEX "IDX_fin_tx_recurring_series"
  ON "financial_transactions" ("condominium_id", "recurring_series_id")
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
  ADD COLUMN \`recurring_series_id\` varchar(36) NULL
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_fin_tx_recurring_series\`
  ON \`financial_transactions\` (\`condominium_id\`, \`recurring_series_id\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_fin_tx_recurring_series"`,
      );
      await queryRunner.query(`
ALTER TABLE "financial_transactions" DROP COLUMN "recurring_series_id"
`);
    } else {
      await queryRunner.query(
        `DROP INDEX \`IDX_fin_tx_recurring_series\` ON \`financial_transactions\``,
      );
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\` DROP COLUMN \`recurring_series_id\`
`);
    }
  }
}
