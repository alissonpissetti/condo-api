import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanningPollMinutesBody1751600000000
  implements MigrationInterface
{
  name = 'PlanningPollMinutesBody1751600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "planning_polls"
        ADD COLUMN IF NOT EXISTS "minutes_body" text NULL
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`planning_polls\`
        ADD COLUMN \`minutes_body\` text NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "planning_polls" DROP COLUMN IF EXISTS "minutes_body"
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`planning_polls\` DROP COLUMN \`minutes_body\`
      `);
    }
  }
}
