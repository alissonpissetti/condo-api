import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PeopleAddress1744700000000 implements MigrationInterface {
  name = 'PeopleAddress1744700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "people"
  ADD COLUMN "address_zip" varchar(8) NULL,
  ADD COLUMN "address_street" varchar(255) NULL,
  ADD COLUMN "address_number" varchar(32) NULL,
  ADD COLUMN "address_complement" varchar(255) NULL,
  ADD COLUMN "address_neighborhood" varchar(255) NULL,
  ADD COLUMN "address_city" varchar(128) NULL,
  ADD COLUMN "address_state" varchar(2) NULL
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`people\`
  ADD COLUMN \`address_zip\` varchar(8) NULL,
  ADD COLUMN \`address_street\` varchar(255) NULL,
  ADD COLUMN \`address_number\` varchar(32) NULL,
  ADD COLUMN \`address_complement\` varchar(255) NULL,
  ADD COLUMN \`address_neighborhood\` varchar(255) NULL,
  ADD COLUMN \`address_city\` varchar(128) NULL,
  ADD COLUMN \`address_state\` varchar(2) NULL
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "people"
  DROP COLUMN "address_zip",
  DROP COLUMN "address_street",
  DROP COLUMN "address_number",
  DROP COLUMN "address_complement",
  DROP COLUMN "address_neighborhood",
  DROP COLUMN "address_city",
  DROP COLUMN "address_state"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`people\`
  DROP COLUMN \`address_zip\`,
  DROP COLUMN \`address_street\`,
  DROP COLUMN \`address_number\`,
  DROP COLUMN \`address_complement\`,
  DROP COLUMN \`address_neighborhood\`,
  DROP COLUMN \`address_city\`,
  DROP COLUMN \`address_state\`
`);
    }
  }
}
