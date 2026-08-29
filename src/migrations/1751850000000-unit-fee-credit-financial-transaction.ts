import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UnitFeeCreditFinancialTransaction1751850000000
  implements MigrationInterface
{
  name = 'UnitFeeCreditFinancialTransaction1751850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "unit_fee_credit_entries"
  ADD COLUMN "financial_transaction_id" varchar(36)
`);
      await queryRunner.query(`
ALTER TABLE "unit_fee_credit_entries"
  ADD CONSTRAINT "FK_unit_fee_credit_tx"
    FOREIGN KEY ("financial_transaction_id")
    REFERENCES "financial_transactions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX "IDX_unit_fee_credit_tx"
  ON "unit_fee_credit_entries" ("financial_transaction_id")
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`unit_fee_credit_entries\`
  ADD COLUMN \`financial_transaction_id\` varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE \`unit_fee_credit_entries\`
  ADD CONSTRAINT \`FK_unit_fee_credit_tx\`
    FOREIGN KEY (\`financial_transaction_id\`)
    REFERENCES \`financial_transactions\`(\`id\`)
    ON DELETE SET NULL ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_unit_fee_credit_tx\`
  ON \`unit_fee_credit_entries\` (\`financial_transaction_id\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        'DROP INDEX IF EXISTS "IDX_unit_fee_credit_tx"',
      );
      await queryRunner.query(`
ALTER TABLE "unit_fee_credit_entries"
  DROP CONSTRAINT IF EXISTS "FK_unit_fee_credit_tx"
`);
      await queryRunner.query(`
ALTER TABLE "unit_fee_credit_entries"
  DROP COLUMN IF EXISTS "financial_transaction_id"
`);
    } else {
      await queryRunner.query(
        'DROP INDEX `IDX_unit_fee_credit_tx` ON `unit_fee_credit_entries`',
      );
      await queryRunner.query(`
ALTER TABLE \`unit_fee_credit_entries\`
  DROP FOREIGN KEY \`FK_unit_fee_credit_tx\`
`);
      await queryRunner.query(`
ALTER TABLE \`unit_fee_credit_entries\`
  DROP COLUMN \`financial_transaction_id\`
`);
    }
  }
}
