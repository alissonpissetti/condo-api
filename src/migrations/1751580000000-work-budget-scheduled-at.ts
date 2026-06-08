import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkBudgetScheduledAt1751580000000 implements MigrationInterface {
  name = 'WorkBudgetScheduledAt1751580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_work_budgets"
ADD COLUMN "scheduled_at" TIMESTAMPTZ NULL
`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_work_budgets\`
ADD COLUMN \`scheduled_at\` datetime NULL
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_work_budgets" DROP COLUMN "scheduled_at"
`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_work_budgets\` DROP COLUMN \`scheduled_at\`
`);
  }
}
