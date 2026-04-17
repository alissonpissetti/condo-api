import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona coluna `payment_receipt_storage_key` em `condominium_fee_charges`
 * para guardar o comprovante (imagem ou PDF) enviado opcionalmente ao quitar
 * uma cobrança. Reaproveita o storage de receipts existente (mesmo bucket
 * usado por transações financeiras).
 */
export class FeeChargePaymentReceipt1750400000000
  implements MigrationInterface
{
  name = 'FeeChargePaymentReceipt1750400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "condominium_fee_charges"
        ADD "payment_receipt_storage_key" varchar(512) NULL
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`condominium_fee_charges\`
        ADD \`payment_receipt_storage_key\` varchar(512) NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "condominium_fee_charges"
        DROP COLUMN "payment_receipt_storage_key"
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`condominium_fee_charges\`
        DROP COLUMN \`payment_receipt_storage_key\`
      `);
    }
  }
}
