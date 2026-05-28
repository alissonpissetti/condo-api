import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumWorks1751450000000 implements MigrationInterface {
  name = 'CondominiumWorks1751450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_works" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "title" varchar(512) NOT NULL,
  "description" text NULL,
  "status" varchar(32) NOT NULL,
  "created_by_user_id" varchar(36) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_works" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cw_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cw_creator" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cw_condo_updated"
  ON "condominium_works" ("condominium_id", "updated_at" DESC)
`);
      await queryRunner.query(`
CREATE TABLE "condominium_work_budgets" (
  "id" varchar(36) NOT NULL,
  "work_id" varchar(36) NOT NULL,
  "supplier_name" varchar(255) NOT NULL,
  "amount_cents" int NOT NULL,
  "valid_until" date NULL,
  "status" varchar(32) NOT NULL,
  "notes" text NULL,
  "created_by_user_id" varchar(36) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_work_budgets" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cwb_work" FOREIGN KEY ("work_id")
    REFERENCES "condominium_works"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cwb_creator" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE TABLE "condominium_work_timeline_entries" (
  "id" varchar(36) NOT NULL,
  "work_id" varchar(36) NOT NULL,
  "kind" varchar(16) NOT NULL,
  "body" text NULL,
  "storage_key" varchar(512) NULL,
  "original_filename" varchar(255) NULL,
  "mime_type" varchar(128) NULL,
  "size_bytes" int NULL,
  "budget_id" varchar(36) NULL,
  "author_user_id" varchar(36) NOT NULL,
  "author_display_name" varchar(255) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_work_timeline" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cwte_work" FOREIGN KEY ("work_id")
    REFERENCES "condominium_works"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cwte_budget" FOREIGN KEY ("budget_id")
    REFERENCES "condominium_work_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cwte_author" FOREIGN KEY ("author_user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cwte_work_created"
  ON "condominium_work_timeline_entries" ("work_id", "created_at" DESC)
`);
      return;
    }
    await queryRunner.query(`
CREATE TABLE \`condominium_works\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`title\` varchar(512) NOT NULL,
  \`description\` text NULL,
  \`status\` varchar(32) NOT NULL,
  \`created_by_user_id\` varchar(36) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_cw_condo_updated\` (\`condominium_id\`, \`updated_at\`),
  KEY \`FK_cw_creator\` (\`created_by_user_id\`),
  CONSTRAINT \`FK_cw_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cw_creator\` FOREIGN KEY (\`created_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`condominium_work_budgets\` (
  \`id\` varchar(36) NOT NULL,
  \`work_id\` varchar(36) NOT NULL,
  \`supplier_name\` varchar(255) NOT NULL,
  \`amount_cents\` int NOT NULL,
  \`valid_until\` date NULL,
  \`status\` varchar(32) NOT NULL,
  \`notes\` text NULL,
  \`created_by_user_id\` varchar(36) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`FK_cwb_work\` (\`work_id\`),
  KEY \`FK_cwb_creator\` (\`created_by_user_id\`),
  CONSTRAINT \`FK_cwb_work\` FOREIGN KEY (\`work_id\`)
    REFERENCES \`condominium_works\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cwb_creator\` FOREIGN KEY (\`created_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`condominium_work_timeline_entries\` (
  \`id\` varchar(36) NOT NULL,
  \`work_id\` varchar(36) NOT NULL,
  \`kind\` varchar(16) NOT NULL,
  \`body\` text NULL,
  \`storage_key\` varchar(512) NULL,
  \`original_filename\` varchar(255) NULL,
  \`mime_type\` varchar(128) NULL,
  \`size_bytes\` int NULL,
  \`budget_id\` varchar(36) NULL,
  \`author_user_id\` varchar(36) NOT NULL,
  \`author_display_name\` varchar(255) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_cwte_work_created\` (\`work_id\`, \`created_at\`),
  KEY \`FK_cwte_budget\` (\`budget_id\`),
  KEY \`FK_cwte_author\` (\`author_user_id\`),
  CONSTRAINT \`FK_cwte_work\` FOREIGN KEY (\`work_id\`)
    REFERENCES \`condominium_works\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cwte_budget\` FOREIGN KEY (\`budget_id\`)
    REFERENCES \`condominium_work_budgets\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cwte_author\` FOREIGN KEY (\`author_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `DROP TABLE IF EXISTS "condominium_work_timeline_entries"`,
      );
      await queryRunner.query(`DROP TABLE IF EXISTS "condominium_work_budgets"`);
      await queryRunner.query(`DROP TABLE IF EXISTS "condominium_works"`);
      return;
    }
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`condominium_work_timeline_entries\``,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS \`condominium_work_budgets\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`condominium_works\``);
  }
}
