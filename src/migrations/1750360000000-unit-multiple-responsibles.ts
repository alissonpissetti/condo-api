import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vários responsáveis por unidade (N:N). Migra `units.responsible_person_id`
 * para `unit_responsible_people` e remove a coluna antiga.
 */
export class UnitMultipleResponsibles1750360000000 implements MigrationInterface {
  name = 'UnitMultipleResponsibles1750360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "unit_responsible_people" (
  "id" varchar(36) NOT NULL,
  "unit_id" varchar(36) NOT NULL,
  "person_id" varchar(36) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_unit_responsible_people" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_urp_unit_person" UNIQUE ("unit_id", "person_id"),
  CONSTRAINT "FK_urp_unit" FOREIGN KEY ("unit_id") REFERENCES "units" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_urp_person" FOREIGN KEY ("person_id") REFERENCES "people" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
INSERT INTO "unit_responsible_people" ("id", "unit_id", "person_id")
SELECT gen_random_uuid()::text, "id", "responsible_person_id"
FROM "units"
WHERE "responsible_person_id" IS NOT NULL
`);
      await queryRunner.query(`
ALTER TABLE "units" DROP CONSTRAINT "FK_units_responsible_person"
`);
      await queryRunner.query(`
ALTER TABLE "units" DROP COLUMN "responsible_person_id"
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`unit_responsible_people\` (
  \`id\` varchar(36) NOT NULL,
  \`unit_id\` varchar(36) NOT NULL,
  \`person_id\` varchar(36) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_urp_unit_person\` (\`unit_id\`, \`person_id\`),
  KEY \`FK_urp_person\` (\`person_id\`),
  CONSTRAINT \`FK_urp_unit\` FOREIGN KEY (\`unit_id\`) REFERENCES \`units\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_urp_person\` FOREIGN KEY (\`person_id\`) REFERENCES \`people\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
INSERT INTO \`unit_responsible_people\` (\`id\`, \`unit_id\`, \`person_id\`)
SELECT UUID(), \`id\`, \`responsible_person_id\` FROM \`units\` WHERE \`responsible_person_id\` IS NOT NULL
`);
      await queryRunner.query(`
ALTER TABLE \`units\` DROP FOREIGN KEY \`FK_units_responsible_person\`
`);
      await queryRunner.query(`
ALTER TABLE \`units\` DROP COLUMN \`responsible_person_id\`
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "units" ADD COLUMN "responsible_person_id" varchar(36) NULL
`);
      await queryRunner.query(`
UPDATE "units" u
SET "responsible_person_id" = s."person_id"
FROM (
  SELECT DISTINCT ON ("unit_id") "unit_id", "person_id"
  FROM "unit_responsible_people"
  ORDER BY "unit_id", "created_at" ASC
) s
WHERE u.id = s.unit_id
`);
      await queryRunner.query(`
ALTER TABLE "units"
  ADD CONSTRAINT "FK_units_responsible_person" FOREIGN KEY ("responsible_person_id") REFERENCES "people" ("id") ON DELETE SET NULL ON UPDATE CASCADE
`);
      await queryRunner.query(`DROP TABLE "unit_responsible_people"`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`units\` ADD COLUMN \`responsible_person_id\` varchar(36) NULL
`);
      await queryRunner.query(`
UPDATE \`units\` u
INNER JOIN (
  SELECT \`unit_id\`, MIN(\`person_id\`) AS \`person_id\`
  FROM \`unit_responsible_people\`
  GROUP BY \`unit_id\`
) s ON s.\`unit_id\` = u.\`id\`
SET u.\`responsible_person_id\` = s.\`person_id\`
`);
      await queryRunner.query(`
ALTER TABLE \`units\`
  ADD CONSTRAINT \`FK_units_responsible_person\` FOREIGN KEY (\`responsible_person_id\`) REFERENCES \`people\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
`);
      await queryRunner.query(`DROP TABLE \`unit_responsible_people\``);
    }
  }
}
