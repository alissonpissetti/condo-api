import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanningPollMinutesAndMeetingNotes1751470000000
  implements MigrationInterface
{
  name = 'PlanningPollMinutesAndMeetingNotes1751470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "planning_polls"
        ADD COLUMN IF NOT EXISTS "minutes_body" text NULL
      `);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "planning_poll_meeting_notes" (
          "id" uuid NOT NULL DEFAULT gen_random_uuid(),
          "condominium_id" uuid NOT NULL,
          "poll_id" uuid NOT NULL,
          "text" text NOT NULL,
          "created_by_user_id" uuid NOT NULL,
          "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
          CONSTRAINT "PK_planning_poll_meeting_notes" PRIMARY KEY ("id"),
          CONSTRAINT "FK_ppmn_poll" FOREIGN KEY ("poll_id")
            REFERENCES "planning_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "FK_ppmn_condo" FOREIGN KEY ("condominium_id")
            REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "FK_ppmn_user" FOREIGN KEY ("created_by_user_id")
            REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_ppmn_poll_created"
        ON "planning_poll_meeting_notes" ("poll_id", "created_at")
      `);
    } else {
      const pollCols = (await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planning_polls'`,
      )) as { COLUMN_NAME: string }[];
      const hasMinutesBody = pollCols.some((c) => c.COLUMN_NAME === 'minutes_body');
      if (!hasMinutesBody) {
        await queryRunner.query(`
          ALTER TABLE \`planning_polls\`
          ADD COLUMN \`minutes_body\` text NULL
        `);
      }
      const noteTables = (await queryRunner.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planning_poll_meeting_notes'`,
      )) as { TABLE_NAME: string }[];
      if (noteTables.length === 0) {
        await queryRunner.query(`
          CREATE TABLE \`planning_poll_meeting_notes\` (
            \`id\` varchar(36) NOT NULL,
            \`condominium_id\` varchar(36) NOT NULL,
            \`poll_id\` varchar(36) NOT NULL,
            \`text\` text NOT NULL,
            \`created_by_user_id\` varchar(36) NOT NULL,
            \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            PRIMARY KEY (\`id\`),
            KEY \`FK_ppmn_poll\` (\`poll_id\`),
            KEY \`FK_ppmn_condo\` (\`condominium_id\`),
            KEY \`FK_ppmn_user\` (\`created_by_user_id\`),
            CONSTRAINT \`FK_ppmn_poll\` FOREIGN KEY (\`poll_id\`)
              REFERENCES \`planning_polls\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT \`FK_ppmn_condo\` FOREIGN KEY (\`condominium_id\`)
              REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT \`FK_ppmn_user\` FOREIGN KEY (\`created_by_user_id\`)
              REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      }
      const noteIdx = (await queryRunner.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planning_poll_meeting_notes'
         AND INDEX_NAME = 'IDX_ppmn_poll_created'`,
      )) as { INDEX_NAME: string }[];
      if (noteIdx.length === 0) {
        await queryRunner.query(`
          CREATE INDEX \`IDX_ppmn_poll_created\`
          ON \`planning_poll_meeting_notes\` (\`poll_id\`, \`created_at\`)
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE IF EXISTS "planning_poll_meeting_notes"`);
      await queryRunner.query(`
        ALTER TABLE "planning_polls" DROP COLUMN IF EXISTS "minutes_body"
      `);
    } else {
      await queryRunner.query(`DROP TABLE IF EXISTS \`planning_poll_meeting_notes\``);
      await queryRunner.query(`
        ALTER TABLE \`planning_polls\` DROP COLUMN \`minutes_body\`
      `);
    }
  }
}
