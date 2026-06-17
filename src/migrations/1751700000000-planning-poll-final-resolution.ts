import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanningPollFinalResolution1751700000000
  implements MigrationInterface
{
  name = 'PlanningPollFinalResolution1751700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`
        ALTER TABLE "planning_polls"
        ADD COLUMN IF NOT EXISTS "final_opinion" text NULL
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`planning_polls\`
        ADD COLUMN \`final_opinion\` text NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`
        ALTER TABLE "planning_polls" DROP COLUMN IF EXISTS "final_opinion"
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`planning_polls\` DROP COLUMN \`final_opinion\`
      `);
    }
  }
}
