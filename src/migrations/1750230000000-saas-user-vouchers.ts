import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SaasUserVouchers1750230000000 implements MigrationInterface {
  name = 'SaasUserVouchers1750230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
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
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_saas_user_vouchers_user_id" ON "saas_user_vouchers" ("user_id")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`saas_user_vouchers\` (
  \`id\` varchar(36) NOT NULL,
  \`user_id\` varchar(36) NOT NULL,
  \`discount_percent\` int NOT NULL,
  \`valid_from\` date NOT NULL,
  \`valid_to\` date NOT NULL,
  \`label\` varchar(128) NULL,
  \`notes\` text NULL,
  \`active\` tinyint(1) NOT NULL DEFAULT 1,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_saas_user_vouchers_user\` (\`user_id\`),
  CONSTRAINT \`FK_saas_user_vouchers_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE "saas_user_vouchers"`);
    } else {
      await queryRunner.query('DROP TABLE IF EXISTS `saas_user_vouchers`');
    }
  }
}
