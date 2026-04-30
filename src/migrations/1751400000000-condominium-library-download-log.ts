import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumLibraryDownloadLog1751400000000
  implements MigrationInterface
{
  name = 'CondominiumLibraryDownloadLog1751400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_library_document_downloads" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "document_id" varchar(36) NOT NULL,
  "user_id" varchar(36) NOT NULL,
  "downloaded_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_cldd" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cldd_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cldd_doc" FOREIGN KEY ("document_id")
    REFERENCES "condominium_library_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cldd_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cldd_condo_at"
  ON "condominium_library_document_downloads" ("condominium_id", "downloaded_at")
`);
      return;
    }
    await queryRunner.query(`
CREATE TABLE \`condominium_library_document_downloads\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`document_id\` varchar(36) NOT NULL,
  \`user_id\` varchar(36) NOT NULL,
  \`downloaded_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_cldd_condo_at\` (\`condominium_id\`, \`downloaded_at\`),
  KEY \`FK_cldd_doc\` (\`document_id\`),
  KEY \`FK_cldd_user\` (\`user_id\`),
  CONSTRAINT \`FK_cldd_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cldd_doc\` FOREIGN KEY (\`document_id\`)
    REFERENCES \`condominium_library_documents\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cldd_user\` FOREIGN KEY (\`user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `DROP TABLE IF EXISTS "condominium_library_document_downloads"`,
      );
      return;
    }
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`condominium_library_document_downloads\``,
    );
  }
}
