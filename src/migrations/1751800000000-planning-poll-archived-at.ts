import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanningPollArchivedAt1751800000000 implements MigrationInterface {
  name = 'PlanningPollArchivedAt1751800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`
        ALTER TABLE "planning_polls"
        ADD COLUMN IF NOT EXISTS "archived_at" timestamp(6) NULL
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`planning_polls\`
        ADD COLUMN \`archived_at\` datetime(6) NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`
        ALTER TABLE "planning_polls" DROP COLUMN IF EXISTS "archived_at"
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`planning_polls\` DROP COLUMN \`archived_at\`
      `);
    }
  }
}
