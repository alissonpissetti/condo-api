import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SaasBilling1750210000000 implements MigrationInterface {
  name = 'SaasBilling1750210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "saas_condominium_billing" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "monthly_amount_cents" int NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'BRL',
  "asaas_customer_id" varchar(64) NULL,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "notes" text NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_saas_condominium_billing" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_saas_billing_condo" UNIQUE ("condominium_id"),
  CONSTRAINT "FK_saas_billing_condo" FOREIGN KEY ("condominium_id") REFERENCES "condominiums" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE TABLE "saas_charge" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "reference_month" varchar(7) NOT NULL,
  "amount_cents" int NOT NULL,
  "due_date" date NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "asaas_payment_id" varchar(64) NULL,
  "invoice_url" text NULL,
  "bank_slip_url" text NULL,
  "pix_qr_payload" text NULL,
  "paid_at" TIMESTAMPTZ NULL,
  "raw_last_webhook_at" TIMESTAMPTZ NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_saas_charge" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_saas_charge_condo_month" UNIQUE ("condominium_id", "reference_month"),
  CONSTRAINT "FK_saas_charge_condo" FOREIGN KEY ("condominium_id") REFERENCES "condominiums" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_saas_charge_condominium_id" ON "saas_charge" ("condominium_id")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`saas_condominium_billing\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`monthly_amount_cents\` int NOT NULL DEFAULT 0,
  \`currency\` varchar(3) NOT NULL DEFAULT 'BRL',
  \`asaas_customer_id\` varchar(64) NULL,
  \`status\` varchar(32) NOT NULL DEFAULT 'active',
  \`notes\` text NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_saas_billing_condo\` (\`condominium_id\`),
  CONSTRAINT \`FK_saas_billing_condo\` FOREIGN KEY (\`condominium_id\`) REFERENCES \`condominiums\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE TABLE \`saas_charge\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`reference_month\` varchar(7) NOT NULL,
  \`amount_cents\` int NOT NULL,
  \`due_date\` date NOT NULL,
  \`status\` varchar(32) NOT NULL DEFAULT 'pending',
  \`asaas_payment_id\` varchar(64) NULL,
  \`invoice_url\` text NULL,
  \`bank_slip_url\` text NULL,
  \`pix_qr_payload\` text NULL,
  \`paid_at\` datetime(6) NULL,
  \`raw_last_webhook_at\` datetime(6) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_saas_charge_condo_month\` (\`condominium_id\`, \`reference_month\`),
  KEY \`IDX_saas_charge_condo\` (\`condominium_id\`),
  CONSTRAINT \`FK_saas_charge_condo\` FOREIGN KEY (\`condominium_id\`) REFERENCES \`condominiums\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE "saas_charge"`);
      await queryRunner.query(`DROP TABLE "saas_condominium_billing"`);
    } else {
      await queryRunner.query('DROP TABLE IF EXISTS `saas_charge`');
      await queryRunner.query('DROP TABLE IF EXISTS `saas_condominium_billing`');
    }
  }
}
