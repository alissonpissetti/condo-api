import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumMaintenances1751820000000 implements MigrationInterface {
  name = 'CondominiumMaintenances1751820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_maintenances" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "title" varchar(512) NOT NULL,
  "description" text NULL,
  "location" varchar(255) NULL,
  "replaced_parts" text NULL,
  "supplier_id" varchar(36) NULL,
  "supplier_name" varchar(255) NULL,
  "status" varchar(32) NOT NULL,
  "created_by_user_id" varchar(36) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_maintenances" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cm_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cm_creator" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cm_condo_updated"
  ON "condominium_maintenances" ("condominium_id", "updated_at" DESC)
`);
      await queryRunner.query(`
CREATE TABLE "condominium_maintenance_timeline_entries" (
  "id" varchar(36) NOT NULL,
  "maintenance_id" varchar(36) NOT NULL,
  "kind" varchar(16) NOT NULL,
  "body" text NULL,
  "storage_key" varchar(512) NULL,
  "original_filename" varchar(255) NULL,
  "mime_type" varchar(128) NULL,
  "size_bytes" int NULL,
  "financial_transaction_id" varchar(36) NULL,
  "author_user_id" varchar(36) NOT NULL,
  "author_display_name" varchar(255) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_maintenance_timeline" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cmte_maintenance" FOREIGN KEY ("maintenance_id")
    REFERENCES "condominium_maintenances"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cmte_author" FOREIGN KEY ("author_user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE UNIQUE INDEX "UQ_cmte_financial_transaction"
  ON "condominium_maintenance_timeline_entries" ("financial_transaction_id")
  WHERE "financial_transaction_id" IS NOT NULL
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cmte_maintenance_created"
  ON "condominium_maintenance_timeline_entries" ("maintenance_id", "created_at" DESC)
`);
      await queryRunner.query(`
CREATE TABLE "condominium_maintenance_timeline_attachments" (
  "id" varchar(36) NOT NULL,
  "entry_id" varchar(36) NOT NULL,
  "storage_key" varchar(512) NOT NULL,
  "original_filename" varchar(255) NOT NULL,
  "mime_type" varchar(128) NOT NULL,
  "size_bytes" int NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_maintenance_timeline_att" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cmta_entry" FOREIGN KEY ("entry_id")
    REFERENCES "condominium_maintenance_timeline_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
ADD COLUMN "maintenance_id" varchar(36) NULL
`);
      await queryRunner.query(`
CREATE INDEX "IDX_ft_maintenance"
  ON "financial_transactions" ("maintenance_id")
  WHERE "maintenance_id" IS NOT NULL
`);
      await queryRunner.query(`
ALTER TABLE "condominium_maintenance_timeline_entries"
ADD CONSTRAINT "FK_cmte_financial_transaction"
FOREIGN KEY ("financial_transaction_id")
REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE
`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions"
ADD CONSTRAINT "FK_ft_maintenance"
FOREIGN KEY ("maintenance_id")
REFERENCES "condominium_maintenances"("id") ON DELETE SET NULL ON UPDATE CASCADE
`);
      return;
    }

    await queryRunner.query(`
CREATE TABLE \`condominium_maintenances\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`title\` varchar(512) NOT NULL,
  \`description\` text NULL,
  \`location\` varchar(255) NULL,
  \`replaced_parts\` text NULL,
  \`supplier_id\` varchar(36) NULL,
  \`supplier_name\` varchar(255) NULL,
  \`status\` varchar(32) NOT NULL,
  \`created_by_user_id\` varchar(36) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_cm_condo_updated\` (\`condominium_id\`, \`updated_at\`),
  KEY \`FK_cm_creator\` (\`created_by_user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`condominium_maintenance_timeline_entries\` (
  \`id\` varchar(36) NOT NULL,
  \`maintenance_id\` varchar(36) NOT NULL,
  \`kind\` varchar(16) NOT NULL,
  \`body\` text NULL,
  \`storage_key\` varchar(512) NULL,
  \`original_filename\` varchar(255) NULL,
  \`mime_type\` varchar(128) NULL,
  \`size_bytes\` int NULL,
  \`financial_transaction_id\` varchar(36) NULL,
  \`author_user_id\` varchar(36) NOT NULL,
  \`author_display_name\` varchar(255) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_cmte_financial_transaction\` (\`financial_transaction_id\`),
  KEY \`IDX_cmte_maintenance_created\` (\`maintenance_id\`, \`created_at\`),
  KEY \`FK_cmte_author\` (\`author_user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`condominium_maintenance_timeline_attachments\` (
  \`id\` varchar(36) NOT NULL,
  \`entry_id\` varchar(36) NOT NULL,
  \`storage_key\` varchar(512) NOT NULL,
  \`original_filename\` varchar(255) NOT NULL,
  \`mime_type\` varchar(128) NOT NULL,
  \`size_bytes\` int NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`FK_cmta_entry\` (\`entry_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
ADD COLUMN \`maintenance_id\` varchar(36) NULL
`);
    await queryRunner.query(`
CREATE INDEX \`IDX_ft_maintenance\` ON \`financial_transactions\` (\`maintenance_id\`)
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "financial_transactions" DROP CONSTRAINT "FK_ft_maintenance"
`);
      await queryRunner.query(`
ALTER TABLE "condominium_maintenance_timeline_entries"
DROP CONSTRAINT "FK_cmte_financial_transaction"
`);
      await queryRunner.query(`DROP INDEX "IDX_ft_maintenance"`);
      await queryRunner.query(`
ALTER TABLE "financial_transactions" DROP COLUMN "maintenance_id"
`);
      await queryRunner.query(`DROP TABLE "condominium_maintenance_timeline_attachments"`);
      await queryRunner.query(`DROP INDEX "IDX_cmte_maintenance_created"`);
      await queryRunner.query(`DROP INDEX "UQ_cmte_financial_transaction"`);
      await queryRunner.query(`DROP TABLE "condominium_maintenance_timeline_entries"`);
      await queryRunner.query(`DROP INDEX "IDX_cm_condo_updated"`);
      await queryRunner.query(`DROP TABLE "condominium_maintenances"`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`financial_transactions\`
DROP INDEX \`IDX_ft_maintenance\`,
DROP COLUMN \`maintenance_id\`
`);
    await queryRunner.query(`DROP TABLE \`condominium_maintenance_timeline_attachments\``);
    await queryRunner.query(`DROP TABLE \`condominium_maintenance_timeline_entries\``);
    await queryRunner.query(`DROP TABLE \`condominium_maintenances\``);
  }
}
