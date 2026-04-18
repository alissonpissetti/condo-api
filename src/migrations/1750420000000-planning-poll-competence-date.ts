import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanningPollCompetenceDate1750420000000
  implements MigrationInterface
{
  name = 'PlanningPollCompetenceDate1750420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "planning_polls"
        ADD COLUMN IF NOT EXISTS "competence_date" date NULL
      `);
      await queryRunner.query(`
        UPDATE "planning_polls"
        SET "competence_date" = ("created_at" AT TIME ZONE 'UTC')::date
        WHERE "competence_date" IS NULL
      `);
      await queryRunner.query(`
        ALTER TABLE "planning_polls"
        ALTER COLUMN "competence_date" SET NOT NULL
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`planning_polls\`
        ADD COLUMN \`competence_date\` date NULL
      `);
      await queryRunner.query(`
        UPDATE \`planning_polls\`
        SET \`competence_date\` = DATE(\`created_at\`)
        WHERE \`competence_date\` IS NULL
      `);
      await queryRunner.query(`
        ALTER TABLE \`planning_polls\`
        MODIFY \`competence_date\` date NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "planning_polls" DROP COLUMN IF EXISTS "competence_date"
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`planning_polls\` DROP COLUMN \`competence_date\`
      `);
    }
  }
}
