import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionReceipt1744970000000 implements MigrationInterface {
  name = 'TransactionReceipt1744970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`financial_transactions\`
      ADD \`receipt_storage_key\` varchar(512) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`financial_transactions\` DROP COLUMN \`receipt_storage_key\`
    `);
  }
}
