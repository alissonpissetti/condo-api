import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SaasPlanPeriodsChangeRequests1750280000000
  implements MigrationInterface
{
  name = 'SaasPlanPeriodsChangeRequests1750280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_saas_plan_period" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "condominium_id" uuid NOT NULL,
  "saas_plan_id" int NOT NULL,
  "valid_from" TIMESTAMPTZ NOT NULL,
  "valid_to" TIMESTAMPTZ NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_saas_plan_period" PRIMARY KEY ("id"),
  CONSTRAINT "FK_csp_condo" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_csp_plan" FOREIGN KEY ("saas_plan_id") REFERENCES "saas_plans"("id") ON DELETE RESTRICT
)
`);
      await queryRunner.query(
        `CREATE INDEX "IDX_csp_condo_valid" ON "condominium_saas_plan_period" ("condominium_id", "valid_from")`,
      );

      await queryRunner.query(`
CREATE TABLE "saas_plan_change_request" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "condominium_id" uuid NOT NULL,
  "from_plan_id" int NULL,
  "requested_plan_id" int NOT NULL,
  "requested_by_user_id" uuid NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "tenant_message" text NULL,
  "admin_note" text NULL,
  "decided_at" TIMESTAMPTZ NULL,
  "decided_by_user_id" uuid NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_saas_plan_change_request" PRIMARY KEY ("id"),
  CONSTRAINT "FK_spcr_condo" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_spcr_from_plan" FOREIGN KEY ("from_plan_id") REFERENCES "saas_plans"("id") ON DELETE SET NULL,
  CONSTRAINT "FK_spcr_req_plan" FOREIGN KEY ("requested_plan_id") REFERENCES "saas_plans"("id") ON DELETE RESTRICT,
  CONSTRAINT "FK_spcr_user" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_spcr_decider" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
)
`);
      await queryRunner.query(
        `CREATE INDEX "IDX_spcr_status" ON "saas_plan_change_request" ("status")`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_spcr_condo" ON "saas_plan_change_request" ("condominium_id")`,
      );

      await queryRunner.query(`
ALTER TABLE "saas_charge" ADD "billing_breakdown" text NULL
`);

      await queryRunner.query(`
INSERT INTO "condominium_saas_plan_period" ("condominium_id", "saas_plan_id", "valid_from", "valid_to")
SELECT c."id",
  COALESCE(c."saas_plan_id", (SELECT "id" FROM "saas_plans" WHERE "is_default" = true ORDER BY "id" ASC LIMIT 1)),
  c."created_at",
  NULL
FROM "condominiums" c
WHERE NOT EXISTS (
  SELECT 1 FROM "condominium_saas_plan_period" p WHERE p."condominium_id" = c."id"
)
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`condominium_saas_plan_period\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`saas_plan_id\` int NOT NULL,
  \`valid_from\` datetime(6) NOT NULL,
  \`valid_to\` datetime(6) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_csp_condo\` FOREIGN KEY (\`condominium_id\`) REFERENCES \`condominiums\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`FK_csp_plan\` FOREIGN KEY (\`saas_plan_id\`) REFERENCES \`saas_plans\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(
        `CREATE INDEX \`IDX_csp_condo_valid\` ON \`condominium_saas_plan_period\` (\`condominium_id\`, \`valid_from\`)`,
      );

      await queryRunner.query(`
CREATE TABLE \`saas_plan_change_request\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`from_plan_id\` int NULL,
  \`requested_plan_id\` int NOT NULL,
  \`requested_by_user_id\` varchar(36) NOT NULL,
  \`status\` varchar(24) NOT NULL DEFAULT 'pending',
  \`tenant_message\` text NULL,
  \`admin_note\` text NULL,
  \`decided_at\` datetime(6) NULL,
  \`decided_by_user_id\` varchar(36) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_spcr_condo\` FOREIGN KEY (\`condominium_id\`) REFERENCES \`condominiums\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`FK_spcr_from_plan\` FOREIGN KEY (\`from_plan_id\`) REFERENCES \`saas_plans\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`FK_spcr_req_plan\` FOREIGN KEY (\`requested_plan_id\`) REFERENCES \`saas_plans\` (\`id\`) ON DELETE RESTRICT,
  CONSTRAINT \`FK_spcr_user\` FOREIGN KEY (\`requested_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`FK_spcr_decider\` FOREIGN KEY (\`decided_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(
        `CREATE INDEX \`IDX_spcr_status\` ON \`saas_plan_change_request\` (\`status\`)`,
      );
      await queryRunner.query(
        `CREATE INDEX \`IDX_spcr_condo\` ON \`saas_plan_change_request\` (\`condominium_id\`)`,
      );

      await queryRunner.query(`
ALTER TABLE \`saas_charge\` ADD \`billing_breakdown\` text NULL
`);

      await queryRunner.query(`
INSERT INTO \`condominium_saas_plan_period\` (\`id\`, \`condominium_id\`, \`saas_plan_id\`, \`valid_from\`, \`valid_to\`)
SELECT UUID(), c.\`id\`,
  COALESCE(c.\`saas_plan_id\`, (SELECT \`id\` FROM \`saas_plans\` WHERE \`is_default\` = 1 ORDER BY \`id\` ASC LIMIT 1)),
  c.\`created_at\`,
  NULL
FROM \`condominiums\` c
WHERE NOT EXISTS (
  SELECT 1 FROM \`condominium_saas_plan_period\` p WHERE p.\`condominium_id\` = c.\`id\`
)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "saas_charge" DROP COLUMN "billing_breakdown"`,
      );
      await queryRunner.query(`DROP TABLE "saas_plan_change_request"`);
      await queryRunner.query(`DROP TABLE "condominium_saas_plan_period"`);
    } else {
      await queryRunner.query(
        `ALTER TABLE \`saas_charge\` DROP COLUMN \`billing_breakdown\``,
      );
      await queryRunner.query(`DROP TABLE \`saas_plan_change_request\``);
      await queryRunner.query(`DROP TABLE \`condominium_saas_plan_period\``);
    }
  }
}
