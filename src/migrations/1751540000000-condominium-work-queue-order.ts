import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumWorkQueueOrder1751540000000
  implements MigrationInterface
{
  name = 'CondominiumWorkQueueOrder1751540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_works"
  ADD COLUMN "queue_order" int NOT NULL DEFAULT 0
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cw_condo_queue"
  ON "condominium_works" ("condominium_id", "queue_order")
`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_works\`
  ADD COLUMN \`queue_order\` int NOT NULL DEFAULT 0
`);
    await queryRunner.query(`
CREATE INDEX \`IDX_cw_condo_queue\` ON \`condominium_works\` (\`condominium_id\`, \`queue_order\`)
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cw_condo_queue"`);
      await queryRunner.query(`
ALTER TABLE "condominium_works" DROP COLUMN IF EXISTS "queue_order"
`);
      return;
    }
    await queryRunner.query(`DROP INDEX \`IDX_cw_condo_queue\` ON \`condominium_works\``);
    await queryRunner.query(`
ALTER TABLE \`condominium_works\` DROP COLUMN \`queue_order\`
`);
  }
}
