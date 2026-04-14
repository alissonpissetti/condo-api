import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropFeeAdjustment1744990000000 implements MigrationInterface {
  name = 'DropFeeAdjustment1744990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_fee_charges" DROP COLUMN IF EXISTS "adjustment_cents"
`);
      return;
    }

    // MySQL/MariaDB: sem IF EXISTS em versões antigas — só remove se a coluna existir
    // (evita erro quando o schema já veio só das entidades + synchronize).
    const rows = await queryRunner.query(
      `
SELECT COUNT(*) AS cnt
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'condominium_fee_charges'
  AND COLUMN_NAME = 'adjustment_cents'
`,
    );
    const first = Array.isArray(rows) ? rows[0] : undefined;
    const cnt = Number(
      first &&
        typeof first === 'object' &&
        first !== null &&
        'cnt' in first
        ? (first as { cnt: number | string }).cnt
        : 0,
    );
    if (cnt > 0) {
      await queryRunner.query(
        `ALTER TABLE \`condominium_fee_charges\` DROP COLUMN \`adjustment_cents\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_fee_charges"
  ADD COLUMN "adjustment_cents" bigint NOT NULL DEFAULT 0
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominium_fee_charges\`
  ADD COLUMN \`adjustment_cents\` bigint NOT NULL DEFAULT 0
`);
    }
  }
}
