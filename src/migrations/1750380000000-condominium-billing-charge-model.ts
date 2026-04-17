import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona modelo de cobrança por condomínio com configurações associadas.
 *
 * Campos:
 *  - billing_charge_model: identificador do modelo (por enquanto só `manual_pix`).
 *  - billing_default_due_day: dia do mês de vencimento padrão (1..31).
 *  - billing_late_interest_bps: taxa de juros aplicada em atraso em basis points
 *    (1 bp = 0,01 %). Ex.: 250 = 2,50 %. Guardar inteiro evita floats.
 */
export class CondominiumBillingChargeModel1750380000000
  implements MigrationInterface
{
  name = 'CondominiumBillingChargeModel1750380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominiums"
  ADD COLUMN "billing_charge_model" varchar(32) NOT NULL DEFAULT 'manual_pix',
  ADD COLUMN "billing_default_due_day" int NOT NULL DEFAULT 10,
  ADD COLUMN "billing_late_interest_bps" int NOT NULL DEFAULT 0
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\`
  ADD COLUMN \`billing_charge_model\` varchar(32) NOT NULL DEFAULT 'manual_pix',
  ADD COLUMN \`billing_default_due_day\` int NOT NULL DEFAULT 10,
  ADD COLUMN \`billing_late_interest_bps\` int NOT NULL DEFAULT 0
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominiums"
  DROP COLUMN "billing_late_interest_bps",
  DROP COLUMN "billing_default_due_day",
  DROP COLUMN "billing_charge_model"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\`
  DROP COLUMN \`billing_late_interest_bps\`,
  DROP COLUMN \`billing_default_due_day\`,
  DROP COLUMN \`billing_charge_model\`
`);
    }
  }
}
