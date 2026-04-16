import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Nomes só para exibição (PDF, UI) sem Person/User associado. */
export class UnitMemberDisplayNames1750330000000 implements MigrationInterface {
  name = 'UnitMemberDisplayNames1750330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "units"
  ADD COLUMN "owner_display_name" varchar(255) NULL,
  ADD COLUMN "responsible_display_name" varchar(255) NULL
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`units\`
  ADD COLUMN \`owner_display_name\` varchar(255) NULL,
  ADD COLUMN \`responsible_display_name\` varchar(255) NULL
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "units"
  DROP COLUMN "owner_display_name",
  DROP COLUMN "responsible_display_name"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`units\`
  DROP COLUMN \`owner_display_name\`,
  DROP COLUMN \`responsible_display_name\`
`);
    }
  }
}
