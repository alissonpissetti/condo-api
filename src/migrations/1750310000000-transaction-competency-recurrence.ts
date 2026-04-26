import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionCompetencyRecurrence1750310000000
  implements MigrationInterface
{
  name = 'TransactionCompetencyRecurrence1750310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "financial_transaction_recurrences" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "kind" varchar(16) NOT NULL,
  "title" varchar(500) NOT NULL,
  "description" text NULL,
  "amount_cents" bigint NOT NULL,
  "fund_id" varchar(36) NULL,
  "allocation_rule" json NOT NULL,
  "frequency" varchar(24) NOT NULL,
  "end_mode" varchar(16) NOT NULL,
  "occurrences_limit" int NULL,
  "run_until" date NULL,
  "occurrences_created" int NOT NULL DEFAULT 0,
  "next_occurrence_on" date NOT NULL,
  "competency_align" varchar(32) NOT NULL DEFAULT 'same_as_occurrence',
  "active" boolean NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_fin_tx_recurrence" PRIMARY KEY ("id"),
  CONSTRAINT "FK_fin_tx_recurrence_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_fin_tx_recurrence_fund" FOREIGN KEY ("fund_id")
    REFERENCES "financial_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_fin_tx_recurrence_active_next"
  ON "financial_transaction_recurrences" ("active", "next_occurrence_on")
`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
  ADD "competency_on" date NULL
`);
      await queryRunner.query(`
UPDATE "financial_transactions" SET "competency_on" = "occurred_on"
`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
  ALTER COLUMN "competency_on" SET NOT NULL
`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
  ADD "recurrence_id" varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "FK_fin_tx_recurrence"
  FOREIGN KEY ("recurrence_id")
  REFERENCES "financial_transaction_recurrences"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`financial_transaction_recurrences\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`kind\` varchar(16) NOT NULL,
  \`title\` varchar(500) NOT NULL,
  \`description\` text NULL,
  \`amount_cents\` bigint NOT NULL,
  \`fund_id\` varchar(36) NULL,
  \`allocation_rule\` json NOT NULL,
  \`frequency\` varchar(24) NOT NULL,
  \`end_mode\` varchar(16) NOT NULL,
  \`occurrences_limit\` int NULL,
  \`run_until\` date NULL,
  \`occurrences_created\` int NOT NULL DEFAULT 0,
  \`next_occurrence_on\` date NOT NULL,
  \`competency_align\` varchar(32) NOT NULL DEFAULT 'same_as_occurrence',
  \`active\` tinyint NOT NULL DEFAULT 1,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_fin_tx_recurrence_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_fin_tx_recurrence_fund\` FOREIGN KEY (\`fund_id\`)
    REFERENCES \`financial_funds\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_fin_tx_recurrence_active_next\`
  ON \`financial_transaction_recurrences\` (\`active\`, \`next_occurrence_on\`)
`);
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
  ADD \`competency_on\` date NULL
`);
      await queryRunner.query(`
UPDATE \`financial_transactions\` SET \`competency_on\` = \`occurred_on\`
`);
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
  MODIFY \`competency_on\` date NOT NULL
`);
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
  ADD \`recurrence_id\` varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
  ADD CONSTRAINT \`FK_fin_tx_recurrence\` FOREIGN KEY (\`recurrence_id\`)
  REFERENCES \`financial_transaction_recurrences\`(\`id\`)
  ON DELETE SET NULL ON UPDATE CASCADE
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        'ALTER TABLE "financial_transactions" DROP CONSTRAINT IF EXISTS "FK_fin_tx_recurrence"',
      );
      await queryRunner.query(
        'ALTER TABLE "financial_transactions" DROP COLUMN IF EXISTS "recurrence_id"',
      );
      await queryRunner.query(
        'ALTER TABLE "financial_transactions" DROP COLUMN IF EXISTS "competency_on"',
      );
      await queryRunner.query(
        'DROP TABLE IF EXISTS "financial_transaction_recurrences"',
      );
    } else {
      await queryRunner.query(
        'ALTER TABLE `financial_transactions` DROP FOREIGN KEY `FK_fin_tx_recurrence`',
      );
      await queryRunner.query(
        'ALTER TABLE `financial_transactions` DROP COLUMN `recurrence_id`',
      );
      await queryRunner.query(
        'ALTER TABLE `financial_transactions` DROP COLUMN `competency_on`',
      );
      await queryRunner.query('DROP TABLE IF EXISTS `financial_transaction_recurrences`');
    }
  }
}
