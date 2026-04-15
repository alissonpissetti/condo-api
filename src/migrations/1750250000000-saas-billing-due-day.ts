import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SaasBillingDueDay1750250000000 implements MigrationInterface {
  name = 'SaasBillingDueDay1750250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "saas_condominium_billing"
  ADD "billing_due_day" smallint NOT NULL DEFAULT 1
`);
      await queryRunner.query(`
UPDATE "saas_condominium_billing" b
SET "billing_due_day" = LEAST(GREATEST(EXTRACT(DAY FROM c.created_at)::int, 1), 28)
FROM "condominiums" c
WHERE c.id = b.condominium_id
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`saas_condominium_billing\`
  ADD \`billing_due_day\` smallint NOT NULL DEFAULT 1
`);
      await queryRunner.query(`
UPDATE \`saas_condominium_billing\` b
INNER JOIN \`condominiums\` c ON c.id = b.condominium_id
SET b.\`billing_due_day\` = LEAST(GREATEST(DAY(c.created_at), 1), 28)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "saas_condominium_billing" DROP COLUMN "billing_due_day"`,
      );
    } else {
      await queryRunner.query(
        `ALTER TABLE \`saas_condominium_billing\` DROP COLUMN \`billing_due_day\``,
      );
    }
  }
}
