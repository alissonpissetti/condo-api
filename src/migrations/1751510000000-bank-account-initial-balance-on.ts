import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BankAccountInitialBalanceOn1751510000000
  implements MigrationInterface
{
  name = 'BankAccountInitialBalanceOn1751510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_bank_accounts"
  ADD COLUMN "initial_balance_on" date NOT NULL DEFAULT (CURRENT_DATE)
`);
      await queryRunner.query(`
UPDATE "condominium_bank_accounts"
SET "initial_balance_on" = ("created_at" AT TIME ZONE 'UTC')::date
WHERE "initial_balance_on" IS NULL
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominium_bank_accounts\`
  ADD COLUMN \`initial_balance_on\` date NOT NULL DEFAULT (CURRENT_DATE)
`);
      await queryRunner.query(`
UPDATE \`condominium_bank_accounts\`
SET \`initial_balance_on\` = DATE(\`created_at\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_bank_accounts" DROP COLUMN "initial_balance_on"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominium_bank_accounts\` DROP COLUMN \`initial_balance_on\`
`);
    }
  }
}
