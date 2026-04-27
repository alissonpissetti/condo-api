import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionMultiDocuments1751340000000
  implements MigrationInterface
{
  name = 'TransactionMultiDocuments1751340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "financial_transactions"
        ADD COLUMN "document_storage_keys" jsonb NULL
      `);
      await queryRunner.query(`
        UPDATE "financial_transactions"
        SET "document_storage_keys" = CASE
          WHEN "document_storage_key" IS NULL THEN NULL
          ELSE jsonb_build_array("document_storage_key")
        END
      `);
      return;
    }

    await queryRunner.query(`
      ALTER TABLE \`financial_transactions\`
      ADD \`document_storage_keys\` json NULL
    `);
    await queryRunner.query(`
      UPDATE \`financial_transactions\`
      SET \`document_storage_keys\` = CASE
        WHEN \`document_storage_key\` IS NULL THEN NULL
        ELSE JSON_ARRAY(\`document_storage_key\`)
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "financial_transactions"
        DROP COLUMN "document_storage_keys"
      `);
      return;
    }
    await queryRunner.query(`
      ALTER TABLE \`financial_transactions\`
      DROP COLUMN \`document_storage_keys\`
    `);
  }
}
