import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanningPollAbstentions1751610000000 implements MigrationInterface {
  name = 'PlanningPollAbstentions1751610000000';

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

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.mysqlHasTable(queryRunner, 'planning_poll_abstentions')) {
      return;
    }
    await queryRunner.query(`
      CREATE TABLE planning_poll_abstentions (
        id CHAR(36) NOT NULL,
        poll_id CHAR(36) NOT NULL,
        unit_id CHAR(36) NOT NULL,
        question_id CHAR(36) NOT NULL,
        recorded_by_user_id CHAR(36) NOT NULL,
        recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_poll_unit_question_abstention (poll_id, unit_id, question_id),
        KEY IDX_planning_poll_abstentions_poll (poll_id),
        KEY IDX_planning_poll_abstentions_unit (unit_id),
        KEY IDX_planning_poll_abstentions_question (question_id),
        CONSTRAINT FK_planning_poll_abstentions_poll
          FOREIGN KEY (poll_id) REFERENCES planning_polls(id) ON DELETE CASCADE,
        CONSTRAINT FK_planning_poll_abstentions_unit
          FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
        CONSTRAINT FK_planning_poll_abstentions_question
          FOREIGN KEY (question_id) REFERENCES planning_poll_questions(id) ON DELETE CASCADE,
        CONSTRAINT FK_planning_poll_abstentions_user
          FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.mysqlHasTable(queryRunner, 'planning_poll_abstentions'))) {
      return;
    }
    await queryRunner.query(`DROP TABLE planning_poll_abstentions`);
  }
}
