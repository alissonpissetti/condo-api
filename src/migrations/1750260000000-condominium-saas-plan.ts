import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumSaasPlan1750260000000 implements MigrationInterface {
  name = 'CondominiumSaasPlan1750260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominiums"
  ADD "saas_plan_id" int NULL
`);
      await queryRunner.query(`
ALTER TABLE "condominiums"
  ADD CONSTRAINT "FK_condominiums_saas_plan_id"
  FOREIGN KEY ("saas_plan_id") REFERENCES "saas_plans"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX "IDX_condominiums_saas_plan_id" ON "condominiums" ("saas_plan_id")
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\`
  ADD \`saas_plan_id\` int NULL
`);
      await queryRunner.query(`
ALTER TABLE \`condominiums\`
  ADD CONSTRAINT \`FK_condominiums_saas_plan_id\`
  FOREIGN KEY (\`saas_plan_id\`) REFERENCES \`saas_plans\` (\`id\`)
  ON DELETE RESTRICT ON UPDATE CASCADE
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "IDX_condominiums_saas_plan_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "condominiums" DROP CONSTRAINT "FK_condominiums_saas_plan_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "condominiums" DROP COLUMN "saas_plan_id"`,
      );
    } else {
      await queryRunner.query(
        `ALTER TABLE \`condominiums\` DROP FOREIGN KEY \`FK_condominiums_saas_plan_id\``,
      );
      await queryRunner.query(
        `ALTER TABLE \`condominiums\` DROP COLUMN \`saas_plan_id\``,
      );
    }
  }
}
