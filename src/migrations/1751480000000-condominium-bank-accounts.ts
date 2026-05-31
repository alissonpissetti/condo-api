import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumBankAccounts1751480000000 implements MigrationInterface {
  name = 'CondominiumBankAccounts1751480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_bank_accounts" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "name" varchar(255) NOT NULL,
  "bank_name" varchar(255) NULL,
  "initial_balance_cents" bigint NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_bank_accounts" PRIMARY KEY ("id"),
  CONSTRAINT "FK_bank_accounts_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_bank_accounts_condo" ON "condominium_bank_accounts" ("condominium_id")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`condominium_bank_accounts\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`bank_name\` varchar(255) NULL,
  \`initial_balance_cents\` bigint NOT NULL DEFAULT 0,
  \`is_active\` tinyint NOT NULL DEFAULT 1,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_bank_accounts_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_bank_accounts_condo\` ON \`condominium_bank_accounts\` (\`condominium_id\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE IF EXISTS "condominium_bank_accounts"`);
    } else {
      await queryRunner.query(`DROP TABLE IF EXISTS \`condominium_bank_accounts\``);
    }
  }
}
