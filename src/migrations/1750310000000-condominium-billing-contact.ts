import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumBillingContact1750310000000
  implements MigrationInterface
{
  name = 'CondominiumBillingContact1750310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominiums"
  ADD COLUMN "billing_pix_key" varchar(255) NULL,
  ADD COLUMN "billing_pix_beneficiary_name" varchar(25) NULL,
  ADD COLUMN "billing_pix_city" varchar(15) NULL,
  ADD COLUMN "syndic_whatsapp_for_receipts" varchar(40) NULL
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\`
  ADD COLUMN \`billing_pix_key\` varchar(255) NULL,
  ADD COLUMN \`billing_pix_beneficiary_name\` varchar(25) NULL,
  ADD COLUMN \`billing_pix_city\` varchar(15) NULL,
  ADD COLUMN \`syndic_whatsapp_for_receipts\` varchar(40) NULL
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominiums"
  DROP COLUMN "syndic_whatsapp_for_receipts",
  DROP COLUMN "billing_pix_city",
  DROP COLUMN "billing_pix_beneficiary_name",
  DROP COLUMN "billing_pix_key"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\`
  DROP COLUMN \`syndic_whatsapp_for_receipts\`,
  DROP COLUMN \`billing_pix_city\`,
  DROP COLUMN \`billing_pix_beneficiary_name\`,
  DROP COLUMN \`billing_pix_key\`
`);
    }
  }
}
