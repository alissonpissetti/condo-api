import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumLibraryDocuments1751320000000
  implements MigrationInterface
{
  name = 'CondominiumLibraryDocuments1751320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_library_documents" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "storage_key" varchar(512) NOT NULL,
  "mime_type" varchar(128) NOT NULL,
  "original_filename" varchar(255) NOT NULL,
  "uploaded_by_user_id" varchar(36) NULL,
  "uploaded_by_display_name" varchar(255) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condo_library_documents" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cld_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cld_uploader" FOREIGN KEY ("uploaded_by_user_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cld_condo_created_at"
  ON "condominium_library_documents" ("condominium_id", "created_at")
`);
      return;
    }
    await queryRunner.query(`
CREATE TABLE \`condominium_library_documents\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`storage_key\` varchar(512) NOT NULL,
  \`mime_type\` varchar(128) NOT NULL,
  \`original_filename\` varchar(255) NOT NULL,
  \`uploaded_by_user_id\` varchar(36) NULL,
  \`uploaded_by_display_name\` varchar(255) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_cld_condo_created_at\` (\`condominium_id\`, \`created_at\`),
  KEY \`FK_cld_uploader\` (\`uploaded_by_user_id\`),
  CONSTRAINT \`FK_cld_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cld_uploader\` FOREIGN KEY (\`uploaded_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE IF EXISTS "condominium_library_documents"`);
      return;
    }
    await queryRunner.query(`DROP TABLE IF EXISTS \`condominium_library_documents\``);
  }
}
