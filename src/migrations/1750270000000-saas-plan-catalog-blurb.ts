import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SaasPlanCatalogBlurb1750270000000 implements MigrationInterface {
  name = 'SaasPlanCatalogBlurb1750270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "saas_plans"
  ADD "catalog_blurb" text NULL
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`saas_plans\`
  ADD \`catalog_blurb\` text NULL
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "saas_plans" DROP COLUMN "catalog_blurb"`,
      );
    } else {
      await queryRunner.query(
        `ALTER TABLE \`saas_plans\` DROP COLUMN \`catalog_blurb\``,
      );
    }
  }
}
