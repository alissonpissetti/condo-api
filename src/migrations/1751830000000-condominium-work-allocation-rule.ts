import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumWorkAllocationRule1751830000000
  implements MigrationInterface
{
  name = 'CondominiumWorkAllocationRule1751830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const defaultRule = JSON.stringify({ kind: 'all_units_equal' });
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_works"
  ADD COLUMN "allocation_rule" json
`);
      await queryRunner.query(
        `UPDATE "condominium_works" SET "allocation_rule" = '${defaultRule}'::json WHERE "allocation_rule" IS NULL`,
      );
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_works\`
  ADD COLUMN \`allocation_rule\` json NULL
`);
    await queryRunner.query(`
UPDATE \`condominium_works\`
  SET \`allocation_rule\` = '${defaultRule}'
  WHERE \`allocation_rule\` IS NULL
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_works" DROP COLUMN IF EXISTS "allocation_rule"
`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_works\` DROP COLUMN \`allocation_rule\`
`);
  }
}
