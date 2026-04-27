import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionDocument1751330000000 implements MigrationInterface {
  name = 'TransactionDocument1751330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`financial_transactions\`
      ADD \`document_storage_key\` varchar(512) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`financial_transactions\` DROP COLUMN \`document_storage_key\`
    `);
  }
}
