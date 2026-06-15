import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FinancialTransactionSupplier1751450000000
  implements MigrationInterface
{
  name = 'FinancialTransactionSupplier1751450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
  ADD COLUMN "supplier_id" varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "FK_fin_tx_supplier" FOREIGN KEY ("supplier_id")
    REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX "IDX_fin_tx_supplier" ON "financial_transactions" ("supplier_id")
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
  ADD COLUMN \`supplier_id\` varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
  ADD CONSTRAINT \`FK_fin_tx_supplier\` FOREIGN KEY (\`supplier_id\`)
    REFERENCES \`suppliers\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_fin_tx_supplier\` ON \`financial_transactions\` (\`supplier_id\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP INDEX "IDX_fin_tx_supplier"`);
      await queryRunner.query(
        `ALTER TABLE "financial_transactions" DROP CONSTRAINT "FK_fin_tx_supplier"`,
      );
      await queryRunner.query(
        `ALTER TABLE "financial_transactions" DROP COLUMN "supplier_id"`,
      );
    } else {
      await queryRunner.query(`DROP INDEX \`IDX_fin_tx_supplier\` ON \`financial_transactions\``);
      await queryRunner.query(
        `ALTER TABLE \`financial_transactions\` DROP FOREIGN KEY \`FK_fin_tx_supplier\``,
      );
      await queryRunner.query(
        `ALTER TABLE \`financial_transactions\` DROP COLUMN \`supplier_id\``,
      );
    }
  }
}
