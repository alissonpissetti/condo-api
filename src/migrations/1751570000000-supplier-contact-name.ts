import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SupplierContactName1751570000000 implements MigrationInterface {
  name = 'SupplierContactName1751570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_suppliers"
ADD COLUMN "contact_name" varchar(255) NULL
`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_suppliers\`
ADD COLUMN \`contact_name\` varchar(255) NULL
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_suppliers" DROP COLUMN "contact_name"
`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_suppliers\` DROP COLUMN \`contact_name\`
`);
  }
}
