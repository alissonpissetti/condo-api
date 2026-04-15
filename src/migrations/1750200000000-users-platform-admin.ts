import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersPlatformAdmin1750200000000 implements MigrationInterface {
  name = 'UsersPlatformAdmin1750200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "users" ADD COLUMN "platform_admin" boolean NOT NULL DEFAULT false
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`users\` ADD COLUMN \`platform_admin\` tinyint(1) NOT NULL DEFAULT 0
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "users" DROP COLUMN "platform_admin"`,
      );
    } else {
      await queryRunner.query(
        `ALTER TABLE \`users\` DROP COLUMN \`platform_admin\``,
      );
    }
  }
}
