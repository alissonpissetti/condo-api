import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordResetChallenges1744900000000 implements MigrationInterface {
  name = 'PasswordResetChallenges1744900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "password_reset_challenges" (
  "id" varchar(36) NOT NULL,
  "channel" varchar(10) NOT NULL,
  "destination" varchar(320) NOT NULL,
  "code_hash" varchar(255) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_password_reset_challenges" PRIMARY KEY ("id")
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_password_reset_challenges_dest" ON "password_reset_challenges" ("channel", "destination")
`);
      await queryRunner.query(`
CREATE INDEX "IDX_password_reset_challenges_expires" ON "password_reset_challenges" ("expires_at")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`password_reset_challenges\` (
  \`id\` varchar(36) NOT NULL,
  \`channel\` varchar(10) NOT NULL,
  \`destination\` varchar(320) NOT NULL,
  \`code_hash\` varchar(255) NOT NULL,
  \`expires_at\` datetime(6) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_password_reset_challenges_dest\` (\`channel\`,\`destination\`),
  KEY \`IDX_password_reset_challenges_expires\` (\`expires_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        'DROP TABLE IF EXISTS "password_reset_challenges"',
      );
    } else {
      await queryRunner.query(
        'DROP TABLE IF EXISTS `password_reset_challenges`',
      );
    }
  }
}
