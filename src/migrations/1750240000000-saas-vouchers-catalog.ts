import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SaasVouchersCatalog1750240000000 implements MigrationInterface {
  name = 'SaasVouchersCatalog1750240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE IF EXISTS "saas_user_vouchers"`);
      await queryRunner.query(`
CREATE TABLE "saas_vouchers" (
  "id" varchar(36) NOT NULL,
  "name" varchar(128) NOT NULL,
  "code" varchar(64) NOT NULL,
  "discount_percent" int NOT NULL,
  "valid_from" date NOT NULL,
  "valid_to" date NOT NULL,
  "notes" text NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_saas_vouchers" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_saas_vouchers_code" UNIQUE ("code")
)`);
      await queryRunner.query(
        `CREATE INDEX "IDX_saas_vouchers_active" ON "saas_vouchers" ("active")`,
      );
      await queryRunner.query(`
ALTER TABLE "condominiums" ADD "saas_voucher_id" varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE "condominiums" ADD CONSTRAINT "FK_condominiums_saas_voucher"
  FOREIGN KEY ("saas_voucher_id") REFERENCES "saas_vouchers" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX "IDX_condominiums_saas_voucher_id" ON "condominiums" ("saas_voucher_id")
`);
    } else {
      await queryRunner.query('DROP TABLE IF EXISTS `saas_user_vouchers`');
      await queryRunner.query(`
CREATE TABLE \`saas_vouchers\` (
  \`id\` varchar(36) NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`code\` varchar(64) NOT NULL,
  \`discount_percent\` int NOT NULL,
  \`valid_from\` date NOT NULL,
  \`valid_to\` date NOT NULL,
  \`notes\` text NULL,
  \`active\` tinyint(1) NOT NULL DEFAULT 1,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_saas_vouchers_code\` (\`code\`),
  KEY \`IDX_saas_vouchers_active\` (\`active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
ALTER TABLE \`condominiums\` ADD \`saas_voucher_id\` varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE \`condominiums\`
  ADD CONSTRAINT \`FK_condominiums_saas_voucher\`
  FOREIGN KEY (\`saas_voucher_id\`) REFERENCES \`saas_vouchers\` (\`id\`)
  ON DELETE SET NULL ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_condominiums_saas_voucher\` ON \`condominiums\` (\`saas_voucher_id\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "condominiums" DROP CONSTRAINT IF EXISTS "FK_condominiums_saas_voucher"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_condominiums_saas_voucher_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "condominiums" DROP COLUMN IF EXISTS "saas_voucher_id"`,
      );
      await queryRunner.query(`DROP TABLE IF EXISTS "saas_vouchers"`);
      await queryRunner.query(`
CREATE TABLE "saas_user_vouchers" (
  "id" varchar(36) NOT NULL,
  "user_id" varchar(36) NOT NULL,
  "discount_percent" int NOT NULL,
  "valid_from" date NOT NULL,
  "valid_to" date NOT NULL,
  "label" varchar(128) NULL,
  "notes" text NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_saas_user_vouchers" PRIMARY KEY ("id"),
  CONSTRAINT "FK_saas_user_vouchers_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
      await queryRunner.query(`
CREATE INDEX "IDX_saas_user_vouchers_user_id" ON "saas_user_vouchers" ("user_id")
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\` DROP FOREIGN KEY \`FK_condominiums_saas_voucher\`
`);
      await queryRunner.query(
        `DROP INDEX \`IDX_condominiums_saas_voucher\` ON \`condominiums\``,
      );
      await queryRunner.query(
        `ALTER TABLE \`condominiums\` DROP COLUMN \`saas_voucher_id\``,
      );
      await queryRunner.query('DROP TABLE IF EXISTS `saas_vouchers`');
    }
  }
}
