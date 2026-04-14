import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FundsPermanentAllocation1744960000000 implements MigrationInterface {
  name = 'FundsPermanentAllocation1744960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "financial_funds"
  ADD COLUMN "is_permanent" boolean NOT NULL DEFAULT false,
  ADD COLUMN "allocation_rule" json NULL,
  ADD COLUMN "permanent_monthly_debit_cents" bigint NULL,
  ADD COLUMN "term_total_per_unit_cents" bigint NULL,
  ADD COLUMN "term_installment_count" int NULL,
  ADD COLUMN "term_monthly_per_unit_cents" bigint NULL
`);
      await queryRunner.query(`
UPDATE "financial_funds"
SET "is_permanent" = (NOT COALESCE("is_temporary", false))
`);
      await queryRunner.query(`
UPDATE "financial_funds"
SET "allocation_rule" = '{"kind":"all_units_equal"}'::json
WHERE "allocation_rule" IS NULL
`);
      await queryRunner.query(`
ALTER TABLE "financial_funds"
  DROP COLUMN "is_temporary",
  DROP COLUMN "ends_at"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`financial_funds\`
  ADD COLUMN \`is_permanent\` tinyint NOT NULL DEFAULT 0,
  ADD COLUMN \`allocation_rule\` json NULL,
  ADD COLUMN \`permanent_monthly_debit_cents\` bigint NULL,
  ADD COLUMN \`term_total_per_unit_cents\` bigint NULL,
  ADD COLUMN \`term_installment_count\` int NULL,
  ADD COLUMN \`term_monthly_per_unit_cents\` bigint NULL
`);
      await queryRunner.query(`
UPDATE \`financial_funds\`
SET \`is_permanent\` = IF(\`is_temporary\` = 0, 1, 0)
`);
      await queryRunner.query(`
UPDATE \`financial_funds\`
SET \`allocation_rule\` = JSON_OBJECT('kind', 'all_units_equal')
WHERE \`allocation_rule\` IS NULL
`);
      await queryRunner.query(`
ALTER TABLE \`financial_funds\`
  DROP COLUMN \`is_temporary\`,
  DROP COLUMN \`ends_at\`
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "financial_funds"
  ADD COLUMN "is_temporary" boolean NOT NULL DEFAULT false,
  ADD COLUMN "ends_at" date NULL
`);
      await queryRunner.query(`
UPDATE "financial_funds"
SET "is_temporary" = (NOT "is_permanent")
`);
      await queryRunner.query(`
ALTER TABLE "financial_funds"
  DROP COLUMN "term_monthly_per_unit_cents",
  DROP COLUMN "term_installment_count",
  DROP COLUMN "term_total_per_unit_cents",
  DROP COLUMN "permanent_monthly_debit_cents",
  DROP COLUMN "allocation_rule",
  DROP COLUMN "is_permanent"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`financial_funds\`
  ADD COLUMN \`is_temporary\` tinyint NOT NULL DEFAULT 0,
  ADD COLUMN \`ends_at\` date NULL
`);
      await queryRunner.query(`
UPDATE \`financial_funds\`
SET \`is_temporary\` = IF(\`is_permanent\` = 0, 1, 0)
`);
      await queryRunner.query(`
ALTER TABLE \`financial_funds\`
  DROP COLUMN \`term_monthly_per_unit_cents\`,
  DROP COLUMN \`term_installment_count\`,
  DROP COLUMN \`term_total_per_unit_cents\`,
  DROP COLUMN \`permanent_monthly_debit_cents\`,
  DROP COLUMN \`allocation_rule\`,
  DROP COLUMN \`is_permanent\`
`);
    }
  }
}
