import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SaasPlans1750220000000 implements MigrationInterface {
  name = 'SaasPlans1750220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "saas_plans" (
  "id" SERIAL NOT NULL,
  "name" varchar(128) NOT NULL,
  "price_per_unit_cents" int NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'BRL',
  "is_default" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "notes" text NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_saas_plans" PRIMARY KEY ("id")
)
`);
      await queryRunner.query(`
INSERT INTO "saas_plans" ("id", "name", "price_per_unit_cents", "currency", "is_default", "active")
VALUES (1, 'Plano padrão', 0, 'BRL', true, true)
`);
      await queryRunner.query(`
SELECT setval(pg_get_serial_sequence('saas_plans', 'id'), (SELECT MAX("id") FROM "saas_plans"))
`);
      await queryRunner.query(`
ALTER TABLE "users" ADD COLUMN "plan_id" int NULL
`);
      await queryRunner.query(`
ALTER TABLE "users" ADD CONSTRAINT "FK_users_plan_id" FOREIGN KEY ("plan_id") REFERENCES "saas_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX "IDX_users_plan_id" ON "users" ("plan_id")
`);
      await queryRunner.query(`
UPDATE "users" SET "plan_id" = 1 WHERE "plan_id" IS NULL
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`saas_plans\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`name\` varchar(128) NOT NULL,
  \`price_per_unit_cents\` int NOT NULL DEFAULT 0,
  \`currency\` varchar(3) NOT NULL DEFAULT 'BRL',
  \`is_default\` tinyint(1) NOT NULL DEFAULT 0,
  \`active\` tinyint(1) NOT NULL DEFAULT 1,
  \`notes\` text NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
INSERT INTO \`saas_plans\` (\`id\`, \`name\`, \`price_per_unit_cents\`, \`currency\`, \`is_default\`, \`active\`)
VALUES (1, 'Plano padrão', 0, 'BRL', 1, 1)
`);
      await queryRunner.query(`ALTER TABLE \`saas_plans\` AUTO_INCREMENT = 2`);
      await queryRunner.query(`
ALTER TABLE \`users\` ADD COLUMN \`plan_id\` int NULL
`);
      await queryRunner.query(`
ALTER TABLE \`users\` ADD CONSTRAINT \`FK_users_plan_id\` FOREIGN KEY (\`plan_id\`) REFERENCES \`saas_plans\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_users_plan_id\` ON \`users\` (\`plan_id\`)
`);
      await queryRunner.query(`
UPDATE \`users\` SET \`plan_id\` = 1 WHERE \`plan_id\` IS NULL
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "users" DROP CONSTRAINT "FK_users_plan_id"`,
      );
      await queryRunner.query(`DROP INDEX "IDX_users_plan_id"`);
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "plan_id"`);
      await queryRunner.query(`DROP TABLE "saas_plans"`);
    } else {
      await queryRunner.query(
        `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_users_plan_id\``,
      );
      await queryRunner.query(`DROP INDEX \`IDX_users_plan_id\` ON \`users\``);
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`plan_id\``);
      await queryRunner.query(`DROP TABLE \`saas_plans\``);
    }
  }
}
