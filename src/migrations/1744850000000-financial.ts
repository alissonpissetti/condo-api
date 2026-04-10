import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Financial1744850000000 implements MigrationInterface {
  name = 'Financial1744850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "financial_funds" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "name" varchar(255) NOT NULL,
  "is_temporary" boolean NOT NULL DEFAULT false,
  "ends_at" date NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_financial_funds" PRIMARY KEY ("id"),
  CONSTRAINT "FK_financial_funds_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE TABLE "financial_transactions" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "fund_id" varchar(36) NULL,
  "kind" varchar(16) NOT NULL,
  "amount_cents" bigint NOT NULL,
  "occurred_on" date NOT NULL,
  "title" varchar(500) NOT NULL,
  "description" text NULL,
  "allocation_rule" json NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_financial_transactions" PRIMARY KEY ("id"),
  CONSTRAINT "FK_fin_tx_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_fin_tx_fund" FOREIGN KEY ("fund_id")
    REFERENCES "financial_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_fin_tx_condo_date" ON "financial_transactions" ("condominium_id", "occurred_on")
`);
      await queryRunner.query(`
CREATE TABLE "transaction_unit_shares" (
  "id" varchar(36) NOT NULL,
  "transaction_id" varchar(36) NOT NULL,
  "unit_id" varchar(36) NOT NULL,
  "share_cents" bigint NOT NULL,
  CONSTRAINT "PK_transaction_unit_shares" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_share_tx_unit" UNIQUE ("transaction_id", "unit_id"),
  CONSTRAINT "FK_share_tx" FOREIGN KEY ("transaction_id")
    REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_share_unit" FOREIGN KEY ("unit_id")
    REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_share_unit" ON "transaction_unit_shares" ("unit_id")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`financial_funds\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`is_temporary\` tinyint NOT NULL DEFAULT 0,
  \`ends_at\` date NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_financial_funds_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE TABLE \`financial_transactions\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`fund_id\` varchar(36) NULL,
  \`kind\` varchar(16) NOT NULL,
  \`amount_cents\` bigint NOT NULL,
  \`occurred_on\` date NOT NULL,
  \`title\` varchar(500) NOT NULL,
  \`description\` text NULL,
  \`allocation_rule\` json NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_fin_tx_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_fin_tx_fund\` FOREIGN KEY (\`fund_id\`)
    REFERENCES \`financial_funds\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_fin_tx_condo_date\` ON \`financial_transactions\` (\`condominium_id\`, \`occurred_on\`)
`);
      await queryRunner.query(`
CREATE TABLE \`transaction_unit_shares\` (
  \`id\` varchar(36) NOT NULL,
  \`transaction_id\` varchar(36) NOT NULL,
  \`unit_id\` varchar(36) NOT NULL,
  \`share_cents\` bigint NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_share_tx_unit\` (\`transaction_id\`, \`unit_id\`),
  CONSTRAINT \`FK_share_tx\` FOREIGN KEY (\`transaction_id\`)
    REFERENCES \`financial_transactions\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_share_unit\` FOREIGN KEY (\`unit_id\`)
    REFERENCES \`units\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_share_unit\` ON \`transaction_unit_shares\` (\`unit_id\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query('DROP TABLE IF EXISTS "transaction_unit_shares"');
      await queryRunner.query('DROP TABLE IF EXISTS "financial_transactions"');
      await queryRunner.query('DROP TABLE IF EXISTS "financial_funds"');
    } else {
      await queryRunner.query('DROP TABLE IF EXISTS `transaction_unit_shares`');
      await queryRunner.query('DROP TABLE IF EXISTS `financial_transactions`');
      await queryRunner.query('DROP TABLE IF EXISTS `financial_funds`');
    }
  }
}
