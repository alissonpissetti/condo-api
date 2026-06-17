import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionTransfer1751500000000 implements MigrationInterface {
  name = 'TransactionTransfer1751500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE financial_transactions
      ADD COLUMN transfer_group_id VARCHAR(36) NULL,
      ADD COLUMN transfer_counterpart_id VARCHAR(36) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_financial_transactions_transfer_group
      ON financial_transactions (condominium_id, transfer_group_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_financial_transactions_transfer_group ON financial_transactions
    `);
    await queryRunner.query(`
      ALTER TABLE financial_transactions
      DROP COLUMN transfer_counterpart_id,
      DROP COLUMN transfer_group_id
    `);
  }
}
