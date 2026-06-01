import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumFeeSlipDeliveryLogs1751530000000
  implements MigrationInterface
{
  name = 'CondominiumFeeSlipDeliveryLogs1751530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_fee_slip_delivery_logs" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "competence_ym" varchar(7) NOT NULL,
  "charge_id" varchar(36) NULL,
  "unit_id" varchar(36) NULL,
  "unit_identifier" varchar(64) NULL,
  "actor_user_id" varchar(36) NOT NULL,
  "action" varchar(32) NOT NULL,
  "detail" json NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_fee_slip_delivery_log" PRIMARY KEY ("id"),
  CONSTRAINT "FK_fee_slip_delivery_charge" FOREIGN KEY ("charge_id")
    REFERENCES "condominium_fee_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_fee_slip_delivery_condo_ym_at"
  ON "condominium_fee_slip_delivery_logs" ("condominium_id", "competence_ym", "created_at")
`);
      return;
    }
    await queryRunner.query(`
CREATE TABLE \`condominium_fee_slip_delivery_logs\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`competence_ym\` varchar(7) NOT NULL,
  \`charge_id\` varchar(36) NULL,
  \`unit_id\` varchar(36) NULL,
  \`unit_identifier\` varchar(64) NULL,
  \`actor_user_id\` varchar(36) NOT NULL,
  \`action\` varchar(32) NOT NULL,
  \`detail\` json NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_fee_slip_delivery_condo_ym_at\` (\`condominium_id\`, \`competence_ym\`, \`created_at\`),
  KEY \`FK_fee_slip_delivery_charge\` (\`charge_id\`),
  CONSTRAINT \`FK_fee_slip_delivery_charge\` FOREIGN KEY (\`charge_id\`)
    REFERENCES \`condominium_fee_charges\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `DROP TABLE IF EXISTS "condominium_fee_slip_delivery_logs"`,
      );
      return;
    }
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`condominium_fee_slip_delivery_logs\``,
    );
  }
}
