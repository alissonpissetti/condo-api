import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersPhoneSmsLogin1744600000000 implements MigrationInterface {
  name = 'UsersPhoneSmsLogin1744600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "users" ADD COLUMN "phone" varchar(20) NULL
`);
      await queryRunner.query(`
CREATE UNIQUE INDEX "UQ_users_phone" ON "users" ("phone") WHERE "phone" IS NOT NULL
`);
      await queryRunner.query(`
CREATE TABLE "login_sms_challenges" (
  "id" varchar(36) NOT NULL,
  "phone" varchar(20) NOT NULL,
  "code_hash" varchar(255) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_login_sms_challenges" PRIMARY KEY ("id")
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_login_sms_challenges_phone" ON "login_sms_challenges" ("phone")
`);
      await queryRunner.query(`
CREATE INDEX "IDX_login_sms_challenges_expires" ON "login_sms_challenges" ("expires_at")
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`users\` ADD COLUMN \`phone\` varchar(20) NULL
`);
      await queryRunner.query(`
CREATE UNIQUE INDEX \`UQ_users_phone\` ON \`users\` (\`phone\`)
`);
      await queryRunner.query(`
CREATE TABLE \`login_sms_challenges\` (
  \`id\` varchar(36) NOT NULL,
  \`phone\` varchar(20) NOT NULL,
  \`code_hash\` varchar(255) NOT NULL,
  \`expires_at\` datetime(6) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_login_sms_challenges_phone\` (\`phone\`),
  KEY \`IDX_login_sms_challenges_expires\` (\`expires_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query('DROP TABLE IF EXISTS "login_sms_challenges"');
      await queryRunner.query('DROP INDEX IF EXISTS "UQ_users_phone"');
      await queryRunner.query('ALTER TABLE "users" DROP COLUMN "phone"');
    } else {
      await queryRunner.query('DROP TABLE IF EXISTS `login_sms_challenges`');
      await queryRunner.query('ALTER TABLE `users` DROP INDEX `UQ_users_phone`');
      await queryRunner.query('ALTER TABLE `users` DROP COLUMN `phone`');
    }
  }
}
