import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionWorkLink1751520000000 implements MigrationInterface {
  name = 'TransactionWorkLink1751520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE financial_transactions
      ADD COLUMN work_id VARCHAR(36) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE financial_transactions
      ADD CONSTRAINT fk_financial_transactions_work
      FOREIGN KEY (work_id) REFERENCES condominium_works(id)
      ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_financial_transactions_work
      ON financial_transactions (condominium_id, work_id)
    `);
    await queryRunner.query(`
      ALTER TABLE condominium_work_timeline_entries
      ADD COLUMN financial_transaction_id VARCHAR(36) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_work_timeline_financial_transaction
      ON condominium_work_timeline_entries (financial_transaction_id)
    `);
    await queryRunner.query(`
      ALTER TABLE condominium_work_timeline_entries
      ADD CONSTRAINT fk_work_timeline_financial_transaction
      FOREIGN KEY (financial_transaction_id) REFERENCES financial_transactions(id)
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE condominium_work_timeline_entries
      DROP FOREIGN KEY fk_work_timeline_financial_transaction
    `);
    await queryRunner.query(`
      DROP INDEX uq_work_timeline_financial_transaction
      ON condominium_work_timeline_entries
    `);
    await queryRunner.query(`
      ALTER TABLE condominium_work_timeline_entries
      DROP COLUMN financial_transaction_id
    `);
    await queryRunner.query(`
      ALTER TABLE financial_transactions
      DROP FOREIGN KEY fk_financial_transactions_work
    `);
    await queryRunner.query(`
      DROP INDEX idx_financial_transactions_work ON financial_transactions
    `);
    await queryRunner.query(`
      ALTER TABLE financial_transactions
      DROP COLUMN work_id
    `);
  }
}
