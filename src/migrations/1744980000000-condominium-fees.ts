import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumFees1744980000000 implements MigrationInterface {
  name = 'CondominiumFees1744980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "fund_monthly_accruals" (
  "id" varchar(36) NOT NULL,
  "fund_id" varchar(36) NOT NULL,
  "competence_ym" varchar(7) NOT NULL,
  "transaction_id" varchar(36) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_fund_monthly_accruals" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_fund_monthly_accrual_fund_ym" UNIQUE ("fund_id", "competence_ym"),
  CONSTRAINT "FK_accrual_fund" FOREIGN KEY ("fund_id")
    REFERENCES "financial_funds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_accrual_tx" FOREIGN KEY ("transaction_id")
    REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE TABLE "condominium_fee_charges" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "competence_ym" varchar(7) NOT NULL,
  "unit_id" varchar(36) NOT NULL,
  "amount_due_cents" bigint NOT NULL,
  "adjustment_cents" bigint NOT NULL DEFAULT 0,
  "due_on" date NOT NULL,
  "status" varchar(16) NOT NULL,
  "paid_at" date NULL,
  "income_transaction_id" varchar(36) NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_fee_charges" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_fee_charge_condo_ym_unit" UNIQUE ("condominium_id", "competence_ym", "unit_id"),
  CONSTRAINT "FK_fee_charge_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_fee_charge_unit" FOREIGN KEY ("unit_id")
    REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_fee_charge_income_tx" FOREIGN KEY ("income_transaction_id")
    REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_fee_charge_condo_ym" ON "condominium_fee_charges" ("condominium_id", "competence_ym")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`fund_monthly_accruals\` (
  \`id\` varchar(36) NOT NULL,
  \`fund_id\` varchar(36) NOT NULL,
  \`competence_ym\` varchar(7) NOT NULL,
  \`transaction_id\` varchar(36) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_fund_monthly_accrual_fund_ym\` (\`fund_id\`, \`competence_ym\`),
  CONSTRAINT \`FK_accrual_fund\` FOREIGN KEY (\`fund_id\`)
    REFERENCES \`financial_funds\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_accrual_tx\` FOREIGN KEY (\`transaction_id\`)
    REFERENCES \`financial_transactions\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE TABLE \`condominium_fee_charges\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`competence_ym\` varchar(7) NOT NULL,
  \`unit_id\` varchar(36) NOT NULL,
  \`amount_due_cents\` bigint NOT NULL,
  \`adjustment_cents\` bigint NOT NULL DEFAULT 0,
  \`due_on\` date NOT NULL,
  \`status\` varchar(16) NOT NULL,
  \`paid_at\` date NULL,
  \`income_transaction_id\` varchar(36) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_fee_charge_condo_ym_unit\` (\`condominium_id\`, \`competence_ym\`, \`unit_id\`),
  CONSTRAINT \`FK_fee_charge_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_fee_charge_unit\` FOREIGN KEY (\`unit_id\`)
    REFERENCES \`units\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_fee_charge_income_tx\` FOREIGN KEY (\`income_transaction_id\`)
    REFERENCES \`financial_transactions\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_fee_charge_condo_ym\` ON \`condominium_fee_charges\` (\`condominium_id\`, \`competence_ym\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE "condominium_fee_charges"`);
      await queryRunner.query(`DROP TABLE "fund_monthly_accruals"`);
    } else {
      await queryRunner.query(`DROP TABLE \`condominium_fee_charges\``);
      await queryRunner.query(`DROP TABLE \`fund_monthly_accruals\``);
    }
  }
}
