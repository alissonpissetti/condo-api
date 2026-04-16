import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumManagementLogo1750320000000
  implements MigrationInterface
{
  name = 'CondominiumManagementLogo1750320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominiums"
  ADD COLUMN "management_logo_storage_key" varchar(512) NULL
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\`
  ADD COLUMN \`management_logo_storage_key\` varchar(512) NULL
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominiums" DROP COLUMN "management_logo_storage_key"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\` DROP COLUMN \`management_logo_storage_key\`
`);
    }
  }
}
