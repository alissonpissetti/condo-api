import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumFeeChargePaymentLogs1751250000000
  implements MigrationInterface
{
  name = 'CondominiumFeeChargePaymentLogs1751250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_fee_charge_payment_logs" (
  "id" varchar(36) NOT NULL,
  "charge_id" varchar(36) NOT NULL,
  "actor_user_id" varchar(36) NOT NULL,
  "action" varchar(32) NOT NULL,
  "detail" json NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_fee_charge_payment_log" PRIMARY KEY ("id"),
  CONSTRAINT "FK_fee_charge_payment_log_charge" FOREIGN KEY ("charge_id")
    REFERENCES "condominium_fee_charges"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_fee_charge_payment_log_charge"
  ON "condominium_fee_charge_payment_logs" ("charge_id")
`);
      await queryRunner.query(`
CREATE INDEX "IDX_fee_charge_payment_log_created"
  ON "condominium_fee_charge_payment_logs" ("created_at")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`condominium_fee_charge_payment_logs\` (
  \`id\` varchar(36) NOT NULL,
  \`charge_id\` varchar(36) NOT NULL,
  \`actor_user_id\` varchar(36) NOT NULL,
  \`action\` varchar(32) NOT NULL,
  \`detail\` json NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_fee_charge_payment_log_charge\` FOREIGN KEY (\`charge_id\`)
    REFERENCES \`condominium_fee_charges\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_fee_charge_payment_log_charge\`
  ON \`condominium_fee_charge_payment_logs\` (\`charge_id\`)
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_fee_charge_payment_log_created\`
  ON \`condominium_fee_charge_payment_logs\` (\`created_at\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        'DROP TABLE IF EXISTS "condominium_fee_charge_payment_logs"',
      );
    } else {
      await queryRunner.query(
        'DROP TABLE IF EXISTS `condominium_fee_charge_payment_logs`',
      );
    }
  }
}
