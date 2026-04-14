import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanningPollMultipleChoice1750050000000
  implements MigrationInterface
{
  name = 'PlanningPollMultipleChoice1750050000000';

  private async mysqlHasColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [table, column],
    )) as { ok: number }[];
    return rows.length > 0;
  }

  private async mysqlHasIndex(
    queryRunner: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 AS ok FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?
       LIMIT 1`,
      [table, indexName],
    )) as { ok: number }[];
    return rows.length > 0;
  }

  private async pgHasConstraint(
    queryRunner: QueryRunner,
    constraintName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 AS ok FROM pg_constraint WHERE conname = $1 LIMIT 1`,
      [constraintName],
    )) as { ok: number }[];
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;

    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "planning_polls"
        ADD COLUMN IF NOT EXISTS "allow_multiple" boolean NOT NULL DEFAULT false
      `);
      const hasNew = await this.pgHasConstraint(
        queryRunner,
        'UQ_poll_unit_option',
      );
      if (!hasNew) {
        await queryRunner.query(`
          ALTER TABLE "planning_poll_votes" DROP CONSTRAINT IF EXISTS "UQ_poll_unit_vote"
        `);
        await queryRunner.query(`
          ALTER TABLE "planning_poll_votes"
          ADD CONSTRAINT "UQ_poll_unit_option" UNIQUE ("poll_id", "unit_id", "option_id")
        `);
      }
    } else {
      const hasCol = await this.mysqlHasColumn(
        queryRunner,
        'planning_polls',
        'allow_multiple',
      );
      if (!hasCol) {
        await queryRunner.query(`
          ALTER TABLE \`planning_polls\`
          ADD COLUMN \`allow_multiple\` tinyint NOT NULL DEFAULT 0
        `);
      }

      const hasNewUq = await this.mysqlHasIndex(
        queryRunner,
        'planning_poll_votes',
        'UQ_poll_unit_option',
      );
      if (hasNewUq) {
        const hasTempIdx = await this.mysqlHasIndex(
          queryRunner,
          'planning_poll_votes',
          'IDX_ppv_poll_id_fk',
        );
        if (hasTempIdx) {
          await queryRunner.query(`
            ALTER TABLE \`planning_poll_votes\` DROP INDEX \`IDX_ppv_poll_id_fk\`
          `);
        }
        return;
      }

      const hasTempIdx = await this.mysqlHasIndex(
        queryRunner,
        'planning_poll_votes',
        'IDX_ppv_poll_id_fk',
      );
      if (!hasTempIdx) {
        await queryRunner.query(`
          ALTER TABLE \`planning_poll_votes\`
          ADD INDEX \`IDX_ppv_poll_id_fk\` (\`poll_id\`)
        `);
      }

      const hasOldUq = await this.mysqlHasIndex(
        queryRunner,
        'planning_poll_votes',
        'UQ_poll_unit_vote',
      );
      if (hasOldUq) {
        await queryRunner.query(`
          ALTER TABLE \`planning_poll_votes\` DROP INDEX \`UQ_poll_unit_vote\`
        `);
      }

      await queryRunner.query(`
        ALTER TABLE \`planning_poll_votes\`
        ADD UNIQUE KEY \`UQ_poll_unit_option\` (\`poll_id\`, \`unit_id\`, \`option_id\`)
      `);

      const stillHasTemp = await this.mysqlHasIndex(
        queryRunner,
        'planning_poll_votes',
        'IDX_ppv_poll_id_fk',
      );
      if (stillHasTemp) {
        await queryRunner.query(`
          ALTER TABLE \`planning_poll_votes\` DROP INDEX \`IDX_ppv_poll_id_fk\`
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;

    if (dialect === 'postgres') {
      const hasNew = await this.pgHasConstraint(
        queryRunner,
        'UQ_poll_unit_option',
      );
      if (hasNew) {
        await queryRunner.query(`
          ALTER TABLE "planning_poll_votes" DROP CONSTRAINT "UQ_poll_unit_option"
        `);
      }
      await queryRunner.query(`
        DELETE FROM "planning_poll_votes" a
        WHERE EXISTS (
          SELECT 1 FROM "planning_poll_votes" b
          WHERE b.poll_id = a.poll_id
            AND b.unit_id = a.unit_id
            AND b.id::text < a.id::text
        )
      `);
      await queryRunner.query(`
        ALTER TABLE "planning_poll_votes"
        ADD CONSTRAINT "UQ_poll_unit_vote" UNIQUE ("poll_id", "unit_id")
      `);
      await queryRunner.query(`
        ALTER TABLE "planning_polls" DROP COLUMN IF EXISTS "allow_multiple"
      `);
    } else {
      const hasNewUq = await this.mysqlHasIndex(
        queryRunner,
        'planning_poll_votes',
        'UQ_poll_unit_option',
      );
      if (hasNewUq) {
        const hasTemp = await this.mysqlHasIndex(
          queryRunner,
          'planning_poll_votes',
          'IDX_ppv_poll_id_fk',
        );
        if (!hasTemp) {
          await queryRunner.query(`
            ALTER TABLE \`planning_poll_votes\`
            ADD INDEX \`IDX_ppv_poll_id_fk\` (\`poll_id\`)
          `);
        }
        await queryRunner.query(`
          ALTER TABLE \`planning_poll_votes\` DROP INDEX \`UQ_poll_unit_option\`
        `);
        await queryRunner.query(`
          DELETE v1 FROM \`planning_poll_votes\` v1
          INNER JOIN \`planning_poll_votes\` v2 ON v1.poll_id = v2.poll_id
            AND v1.unit_id = v2.unit_id
            AND v1.id > v2.id
        `);
        await queryRunner.query(`
          ALTER TABLE \`planning_poll_votes\`
          ADD UNIQUE KEY \`UQ_poll_unit_vote\` (\`poll_id\`, \`unit_id\`)
        `);
        const hasTempAfter = await this.mysqlHasIndex(
          queryRunner,
          'planning_poll_votes',
          'IDX_ppv_poll_id_fk',
        );
        if (hasTempAfter) {
          await queryRunner.query(`
            ALTER TABLE \`planning_poll_votes\` DROP INDEX \`IDX_ppv_poll_id_fk\`
          `);
        }
      }
      const hasCol = await this.mysqlHasColumn(
        queryRunner,
        'planning_polls',
        'allow_multiple',
      );
      if (hasCol) {
        await queryRunner.query(`
          ALTER TABLE \`planning_polls\` DROP COLUMN \`allow_multiple\`
        `);
      }
    }
  }
}
