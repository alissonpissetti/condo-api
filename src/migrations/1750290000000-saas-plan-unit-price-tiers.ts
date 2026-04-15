import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SaasPlanUnitPriceTiers1750290000000 implements MigrationInterface {
  name = 'SaasPlanUnitPriceTiers1750290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "saas_plans"
        ADD "unit_price_tiers" json NULL
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`saas_plans\`
        ADD \`unit_price_tiers\` json NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "saas_plans" DROP COLUMN "unit_price_tiers"
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`saas_plans\` DROP COLUMN \`unit_price_tiers\`
      `);
    }
  }
}
