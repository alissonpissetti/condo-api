import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumWorkBudgetAttachments1751460000000
  implements MigrationInterface
{
  name = 'CondominiumWorkBudgetAttachments1751460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_work_budget_attachments" (
  "id" varchar(36) NOT NULL,
  "budget_id" varchar(36) NOT NULL,
  "storage_key" varchar(512) NOT NULL,
  "original_filename" varchar(255) NOT NULL,
  "mime_type" varchar(128) NOT NULL,
  "size_bytes" int NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_cwba" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cwba_budget" FOREIGN KEY ("budget_id")
    REFERENCES "condominium_work_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cwba_budget" ON "condominium_work_budget_attachments" ("budget_id")
`);
      return;
    }
    await queryRunner.query(`
CREATE TABLE \`condominium_work_budget_attachments\` (
  \`id\` varchar(36) NOT NULL,
  \`budget_id\` varchar(36) NOT NULL,
  \`storage_key\` varchar(512) NOT NULL,
  \`original_filename\` varchar(255) NOT NULL,
  \`mime_type\` varchar(128) NOT NULL,
  \`size_bytes\` int NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_cwba_budget\` (\`budget_id\`),
  CONSTRAINT \`FK_cwba_budget\` FOREIGN KEY (\`budget_id\`)
    REFERENCES \`condominium_work_budgets\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `DROP TABLE IF EXISTS "condominium_work_budget_attachments"`,
      );
      return;
    }
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`condominium_work_budget_attachments\``,
    );
  }
}
