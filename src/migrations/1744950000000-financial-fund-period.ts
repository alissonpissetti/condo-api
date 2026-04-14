import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FinancialFundPeriod1744950000000 implements MigrationInterface {
  name = 'FinancialFundPeriod1744950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "financial_funds"
  ADD COLUMN "period_start_ym" varchar(7) NULL,
  ADD COLUMN "period_end_ym" varchar(7) NULL
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`financial_funds\`
  ADD COLUMN \`period_start_ym\` varchar(7) NULL,
  ADD COLUMN \`period_end_ym\` varchar(7) NULL
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "financial_funds"
  DROP COLUMN "period_end_ym",
  DROP COLUMN "period_start_ym"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`financial_funds\`
  DROP COLUMN \`period_end_ym\`,
  DROP COLUMN \`period_start_ym\`
`);
    }
  }
}
