import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ConstructionWorks1751460000000 implements MigrationInterface {
  name = 'ConstructionWorks1751460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "construction_projects" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "title" varchar(500) NOT NULL,
  "description" text NULL,
  "status" varchar(24) NOT NULL,
  "started_on" date NULL,
  "expected_end_on" date NULL,
  "completed_on" date NULL,
  "supplier_id" varchar(36) NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_construction_projects" PRIMARY KEY ("id"),
  CONSTRAINT "FK_construction_projects_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_construction_projects_supplier" FOREIGN KEY ("supplier_id")
    REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_construction_projects_condo" ON "construction_projects" ("condominium_id")
`);
      await queryRunner.query(`
CREATE INDEX "IDX_construction_projects_status" ON "construction_projects" ("condominium_id", "status")
`);
      await queryRunner.query(`
CREATE TABLE "construction_project_updates" (
  "id" varchar(36) NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "occurred_on" date NOT NULL,
  "body" text NOT NULL,
  "created_by_user_id" varchar(36) NULL,
  "attachment_storage_keys" json NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_construction_project_updates" PRIMARY KEY ("id"),
  CONSTRAINT "FK_construction_updates_project" FOREIGN KEY ("project_id")
    REFERENCES "construction_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_construction_updates_user" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_construction_updates_project_occurred" ON "construction_project_updates" ("project_id", "occurred_on", "created_at")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`construction_projects\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`title\` varchar(500) NOT NULL,
  \`description\` text NULL,
  \`status\` varchar(24) NOT NULL,
  \`started_on\` date NULL,
  \`expected_end_on\` date NULL,
  \`completed_on\` date NULL,
  \`supplier_id\` varchar(36) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_construction_projects_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_construction_projects_supplier\` FOREIGN KEY (\`supplier_id\`)
    REFERENCES \`suppliers\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_construction_projects_condo\` ON \`construction_projects\` (\`condominium_id\`)
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_construction_projects_status\` ON \`construction_projects\` (\`condominium_id\`, \`status\`)
`);
      await queryRunner.query(`
CREATE TABLE \`construction_project_updates\` (
  \`id\` varchar(36) NOT NULL,
  \`project_id\` varchar(36) NOT NULL,
  \`occurred_on\` date NOT NULL,
  \`body\` text NOT NULL,
  \`created_by_user_id\` varchar(36) NULL,
  \`attachment_storage_keys\` json NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_construction_updates_project\` FOREIGN KEY (\`project_id\`)
    REFERENCES \`construction_projects\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_construction_updates_user\` FOREIGN KEY (\`created_by_user_id\`)
    REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_construction_updates_project_occurred\` ON \`construction_project_updates\` (\`project_id\`, \`occurred_on\`, \`created_at\`)
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE IF EXISTS "construction_project_updates"`);
      await queryRunner.query(`DROP TABLE IF EXISTS "construction_projects"`);
    } else {
      await queryRunner.query(`DROP TABLE IF EXISTS \`construction_project_updates\``);
      await queryRunner.query(`DROP TABLE IF EXISTS \`construction_projects\``);
    }
  }
}
