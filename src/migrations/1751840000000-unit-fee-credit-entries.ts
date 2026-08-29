import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UnitFeeCreditEntries1751840000000 implements MigrationInterface {
  name = 'UnitFeeCreditEntries1751840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "unit_fee_credit_entries" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "unit_id" varchar(36) NOT NULL,
  "signed_amount_cents" bigint NOT NULL,
  "entry_kind" varchar(32) NOT NULL,
  "justification" text,
  "payment_receipt_storage_key" varchar(512),
  "bank_account_id" varchar(36),
  "charge_id" varchar(36),
  "actor_user_id" varchar(36) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_unit_fee_credit_entry" PRIMARY KEY ("id"),
  CONSTRAINT "FK_unit_fee_credit_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_unit_fee_credit_unit" FOREIGN KEY ("unit_id")
    REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_unit_fee_credit_bank" FOREIGN KEY ("bank_account_id")
    REFERENCES "condominium_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FK_unit_fee_credit_charge" FOREIGN KEY ("charge_id")
    REFERENCES "condominium_fee_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_unit_fee_credit_unit"
  ON "unit_fee_credit_entries" ("condominium_id", "unit_id", "created_at")
`);
      await queryRunner.query(`
CREATE INDEX "IDX_unit_fee_credit_charge"
  ON "unit_fee_credit_entries" ("charge_id")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`unit_fee_credit_entries\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`unit_id\` varchar(36) NOT NULL,
  \`signed_amount_cents\` bigint NOT NULL,
  \`entry_kind\` varchar(32) NOT NULL,
  \`justification\` text,
  \`payment_receipt_storage_key\` varchar(512),
  \`bank_account_id\` varchar(36),
  \`charge_id\` varchar(36),
  \`actor_user_id\` varchar(36) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_unit_fee_credit_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_unit_fee_credit_unit\` FOREIGN KEY (\`unit_id\`)
    REFERENCES \`units\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_unit_fee_credit_bank\` FOREIGN KEY (\`bank_account_id\`)
    REFERENCES \`condominium_bank_accounts\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`FK_unit_fee_credit_charge\` FOREIGN KEY (\`charge_id\`)
    REFERENCES \`condominium_fee_charges\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_unit_fee_credit_unit\`
  ON \`unit_fee_credit_entries\` (\`condominium_id\`, \`unit_id\`, \`created_at\`)
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_unit_fee_credit_charge\`
  ON \`unit_fee_credit_entries\` (\`charge_id\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query('DROP TABLE IF EXISTS "unit_fee_credit_entries"');
    } else {
      await queryRunner.query('DROP TABLE IF EXISTS `unit_fee_credit_entries`');
    }
  }
}
