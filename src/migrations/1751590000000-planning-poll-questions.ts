import { randomUUID } from 'crypto';
import type { MigrationInterface, QueryRunner } from 'typeorm';

type PollRow = {
  id: string;
  title: string;
  allow_multiple: boolean | number;
  decided_option_id: string | null;
};

type OptionRow = {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
};

export class PlanningPollQuestions1751590000000 implements MigrationInterface {
  name = 'PlanningPollQuestions1751590000000';

  private async mysqlHasTable(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
      [table],
    )) as { ok: number }[];
    return rows.length > 0;
  }

  private async mysqlHasColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [table, column],
    )) as { ok: number }[];
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;

    if (dialect === 'postgres') {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "planning_poll_questions" (
          "id" varchar(36) NOT NULL,
          "poll_id" varchar(36) NOT NULL,
          "title" varchar(512) NOT NULL,
          "sort_order" int NOT NULL DEFAULT 0,
          "allow_multiple" boolean NOT NULL DEFAULT false,
          "decided_option_id" varchar(36),
          CONSTRAINT "PK_planning_poll_questions" PRIMARY KEY ("id"),
          CONSTRAINT "FK_ppq_poll" FOREIGN KEY ("poll_id")
            REFERENCES "planning_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_ppq_poll_sort"
        ON "planning_poll_questions" ("poll_id", "sort_order")
      `);
      await queryRunner.query(`
        ALTER TABLE "planning_poll_options"
        ADD COLUMN IF NOT EXISTS "question_id" varchar(36)
      `);
    } else {
      const hasTable = await this.mysqlHasTable(
        queryRunner,
        'planning_poll_questions',
      );
      if (!hasTable) {
        await queryRunner.query(`
          CREATE TABLE \`planning_poll_questions\` (
            \`id\` varchar(36) NOT NULL,
            \`poll_id\` varchar(36) NOT NULL,
            \`title\` varchar(512) NOT NULL,
            \`sort_order\` int NOT NULL DEFAULT 0,
            \`allow_multiple\` tinyint NOT NULL DEFAULT 0,
            \`decided_option_id\` varchar(36) NULL,
            PRIMARY KEY (\`id\`),
            KEY \`IDX_ppq_poll_sort\` (\`poll_id\`, \`sort_order\`),
            CONSTRAINT \`FK_ppq_poll\` FOREIGN KEY (\`poll_id\`)
              REFERENCES \`planning_polls\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      }
      const hasCol = await this.mysqlHasColumn(
        queryRunner,
        'planning_poll_options',
        'question_id',
      );
      if (!hasCol) {
        await queryRunner.query(`
          ALTER TABLE \`planning_poll_options\`
          ADD COLUMN \`question_id\` varchar(36) NULL AFTER \`poll_id\`
        `);
      }
    }

    const polls = (await queryRunner.query(
      dialect === 'postgres'
        ? `SELECT id, title, allow_multiple, decided_option_id FROM planning_polls`
        : `SELECT id, title, allow_multiple, decided_option_id FROM planning_polls`,
    )) as PollRow[];

    for (const poll of polls) {
      const opts = (await queryRunner.query(
        dialect === 'postgres'
          ? `SELECT id, poll_id, label, sort_order FROM planning_poll_options
             WHERE poll_id = $1 ORDER BY sort_order ASC, label ASC`
          : `SELECT id, poll_id, label, sort_order FROM planning_poll_options
             WHERE poll_id = ? ORDER BY sort_order ASC, label ASC`,
        [poll.id],
      )) as OptionRow[];
      if (opts.length === 0) {
        continue;
      }

      const existingQ = (await queryRunner.query(
        dialect === 'postgres'
          ? `SELECT id FROM planning_poll_questions WHERE poll_id = $1 LIMIT 1`
          : `SELECT id FROM planning_poll_questions WHERE poll_id = ? LIMIT 1`,
        [poll.id],
      )) as { id: string }[];
      if (existingQ.length > 0) {
        const qid = existingQ[0].id;
        for (const o of opts) {
          await queryRunner.query(
            dialect === 'postgres'
              ? `UPDATE planning_poll_options SET question_id = $1 WHERE id = $2 AND question_id IS NULL`
              : `UPDATE planning_poll_options SET question_id = ? WHERE id = ? AND question_id IS NULL`,
            [qid, o.id],
          );
        }
        continue;
      }

      const questionId = randomUUID();
      const allowMultiple =
        dialect === 'postgres'
          ? !!poll.allow_multiple
          : Number(poll.allow_multiple) === 1;

      if (dialect === 'postgres') {
        await queryRunner.query(
          `INSERT INTO planning_poll_questions
            (id, poll_id, title, sort_order, allow_multiple, decided_option_id)
           VALUES ($1, $2, $3, 0, $4, $5)`,
          [
            questionId,
            poll.id,
            poll.title,
            allowMultiple,
            poll.decided_option_id,
          ],
        );
        for (const o of opts) {
          await queryRunner.query(
            `UPDATE planning_poll_options SET question_id = $1 WHERE id = $2`,
            [questionId, o.id],
          );
        }
      } else {
        await queryRunner.query(
          `INSERT INTO planning_poll_questions
            (id, poll_id, title, sort_order, allow_multiple, decided_option_id)
           VALUES (?, ?, ?, 0, ?, ?)`,
          [
            questionId,
            poll.id,
            poll.title,
            allowMultiple ? 1 : 0,
            poll.decided_option_id,
          ],
        );
        for (const o of opts) {
          await queryRunner.query(
            `UPDATE planning_poll_options SET question_id = ? WHERE id = ?`,
            [questionId, o.id],
          );
        }
      }
    }

    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "planning_poll_options"
        ALTER COLUMN "question_id" SET NOT NULL
      `);
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "planning_poll_options"
          ADD CONSTRAINT "FK_ppo_question"
          FOREIGN KEY ("question_id") REFERENCES "planning_poll_questions"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    } else {
      const hasFk = (await queryRunner.query(
        `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'planning_poll_options'
           AND CONSTRAINT_NAME = 'FK_ppo_question'
         LIMIT 1`,
      )) as { ok: number }[];
      if (!hasFk.length) {
        await queryRunner.query(`
          ALTER TABLE \`planning_poll_options\`
          MODIFY \`question_id\` varchar(36) NOT NULL,
          ADD CONSTRAINT \`FK_ppo_question\` FOREIGN KEY (\`question_id\`)
            REFERENCES \`planning_poll_questions\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "planning_poll_options" DROP CONSTRAINT IF EXISTS "FK_ppo_question"
      `);
      await queryRunner.query(`
        ALTER TABLE "planning_poll_options" DROP COLUMN IF EXISTS "question_id"
      `);
      await queryRunner.query(`DROP TABLE IF EXISTS "planning_poll_questions"`);
    } else {
      const hasFk = (await queryRunner.query(
        `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'planning_poll_options'
           AND CONSTRAINT_NAME = 'FK_ppo_question'
         LIMIT 1`,
      )) as { ok: number }[];
      if (hasFk.length) {
        await queryRunner.query(`
          ALTER TABLE \`planning_poll_options\` DROP FOREIGN KEY \`FK_ppo_question\`
        `);
      }
      const hasCol = await this.mysqlHasColumn(
        queryRunner,
        'planning_poll_options',
        'question_id',
      );
      if (hasCol) {
        await queryRunner.query(`
          ALTER TABLE \`planning_poll_options\` DROP COLUMN \`question_id\`
        `);
      }
      const hasTable = await this.mysqlHasTable(
        queryRunner,
        'planning_poll_questions',
      );
      if (hasTable) {
        await queryRunner.query(`DROP TABLE \`planning_poll_questions\``);
      }
    }
  }
}
