import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionBankAccount1751490000000 implements MigrationInterface {
  name = 'TransactionBankAccount1751490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
  ADD COLUMN "bank_account_id" varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "FK_fin_tx_bank_account" FOREIGN KEY ("bank_account_id")
    REFERENCES "condominium_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX "IDX_fin_tx_bank_account" ON "financial_transactions" ("bank_account_id")
`);
      await queryRunner.query(`
ALTER TABLE "condominium_fee_charges"
  ADD COLUMN "bank_account_id" varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE "condominium_fee_charges"
  ADD CONSTRAINT "FK_fee_charge_bank_account" FOREIGN KEY ("bank_account_id")
    REFERENCES "condominium_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
`);
      await queryRunner.query(`
ALTER TABLE "financial_transaction_recurrences"
  ADD COLUMN "bank_account_id" varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE "financial_transaction_recurrences"
  ADD CONSTRAINT "FK_fin_rec_bank_account" FOREIGN KEY ("bank_account_id")
    REFERENCES "condominium_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
  ADD COLUMN \`bank_account_id\` varchar(36) NULL,
  ADD CONSTRAINT \`FK_fin_tx_bank_account\` FOREIGN KEY (\`bank_account_id\`)
    REFERENCES \`condominium_bank_accounts\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_fin_tx_bank_account\` ON \`financial_transactions\` (\`bank_account_id\`)
`);
      await queryRunner.query(`
ALTER TABLE \`condominium_fee_charges\`
  ADD COLUMN \`bank_account_id\` varchar(36) NULL,
  ADD CONSTRAINT \`FK_fee_charge_bank_account\` FOREIGN KEY (\`bank_account_id\`)
    REFERENCES \`condominium_bank_accounts\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
`);
      await queryRunner.query(`
ALTER TABLE \`financial_transaction_recurrences\`
  ADD COLUMN \`bank_account_id\` varchar(36) NULL,
  ADD CONSTRAINT \`FK_fin_rec_bank_account\` FOREIGN KEY (\`bank_account_id\`)
    REFERENCES \`condominium_bank_accounts\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
`);
    }

    const backfillTx = `
UPDATE financial_transactions t
SET bank_account_id = (
  SELECT a.id FROM condominium_bank_accounts a
  WHERE a.condominium_id = t.condominium_id AND a.is_active = true
  ORDER BY a.created_at ASC
  LIMIT 1
)
WHERE t.bank_account_id IS NULL
  AND EXISTS (
    SELECT 1 FROM condominium_bank_accounts a
    WHERE a.condominium_id = t.condominium_id
  )
`;
  await queryRunner.query(backfillTx);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "financial_transaction_recurrences" DROP CONSTRAINT IF EXISTS "FK_fin_rec_bank_account"
`);
      await queryRunner.query(`
ALTER TABLE "financial_transaction_recurrences" DROP COLUMN IF EXISTS "bank_account_id"
`);
      await queryRunner.query(`
ALTER TABLE "condominium_fee_charges" DROP CONSTRAINT IF EXISTS "FK_fee_charge_bank_account"
`);
      await queryRunner.query(`
ALTER TABLE "condominium_fee_charges" DROP COLUMN IF EXISTS "bank_account_id"
`);
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fin_tx_bank_account"`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions" DROP CONSTRAINT IF EXISTS "FK_fin_tx_bank_account"
`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions" DROP COLUMN IF EXISTS "bank_account_id"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`financial_transaction_recurrences\` DROP FOREIGN KEY \`FK_fin_rec_bank_account\`
`);
      await queryRunner.query(`
ALTER TABLE \`financial_transaction_recurrences\` DROP COLUMN \`bank_account_id\`
`);
      await queryRunner.query(`
ALTER TABLE \`condominium_fee_charges\` DROP FOREIGN KEY \`FK_fee_charge_bank_account\`
`);
      await queryRunner.query(`
ALTER TABLE \`condominium_fee_charges\` DROP COLUMN \`bank_account_id\`
`);
      await queryRunner.query(`DROP INDEX \`IDX_fin_tx_bank_account\` ON \`financial_transactions\``);
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\` DROP FOREIGN KEY \`FK_fin_tx_bank_account\`
`);
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\` DROP COLUMN \`bank_account_id\`
`);
    }
  }
}
