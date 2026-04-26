import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UnitsFinancialResponsiblePerson1751260000000
  implements MigrationInterface
{
  name = 'UnitsFinancialResponsiblePerson1751260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "units"
  ADD COLUMN "financial_responsible_person_id" varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE "units"
  ADD CONSTRAINT "FK_units_financial_responsible_person"
  FOREIGN KEY ("financial_responsible_person_id")
  REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`units\`
  ADD COLUMN \`financial_responsible_person_id\` varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE \`units\`
  ADD CONSTRAINT \`FK_units_financial_responsible_person\`
  FOREIGN KEY (\`financial_responsible_person_id\`)
  REFERENCES \`people\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        'ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "FK_units_financial_responsible_person"',
      );
      await queryRunner.query(
        'ALTER TABLE "units" DROP COLUMN IF EXISTS "financial_responsible_person_id"',
      );
    } else {
      await queryRunner.query(
        'ALTER TABLE `units` DROP FOREIGN KEY `FK_units_financial_responsible_person`',
      );
      await queryRunner.query(
        'ALTER TABLE `units` DROP COLUMN `financial_responsible_person_id`',
      );
    }
  }
}
