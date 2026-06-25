import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkBudgetTitle1751810000000 implements MigrationInterface {
  name = 'WorkBudgetTitle1751810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_work_budgets"
ADD COLUMN "title" varchar(255) NULL
`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_work_budgets\`
ADD COLUMN \`title\` varchar(255) NULL
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_work_budgets" DROP COLUMN "title"
`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_work_budgets\` DROP COLUMN \`title\`
`);
  }
}
