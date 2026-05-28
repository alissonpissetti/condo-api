import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunicationSoftDelete1751430000000 implements MigrationInterface {
  name = 'CommunicationSoftDelete1751430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "communications"
  ADD COLUMN "deleted_at" TIMESTAMPTZ NULL,
  ADD COLUMN "deleted_by_user_id" varchar(36) NULL
`);
      await queryRunner.query(`
CREATE INDEX "IDX_comm_condo_not_deleted" ON "communications" ("condominium_id")
  WHERE "deleted_at" IS NULL
`);
      return;
    }

    await queryRunner.query(`
ALTER TABLE \`communications\`
  ADD COLUMN \`deleted_at\` datetime(6) NULL,
  ADD COLUMN \`deleted_by_user_id\` varchar(36) NULL
`);
    await queryRunner.query(`
CREATE INDEX \`IDX_comm_condo_not_deleted\` ON \`communications\` (\`condominium_id\`, \`deleted_at\`)
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_comm_condo_not_deleted"`);
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "deleted_by_user_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "deleted_at"`,
      );
      return;
    }

    await queryRunner.query(`DROP INDEX \`IDX_comm_condo_not_deleted\` ON \`communications\``);
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`deleted_by_user_id\``,
    );
    await queryRunner.query(`ALTER TABLE \`communications\` DROP COLUMN \`deleted_at\``);
  }
}
