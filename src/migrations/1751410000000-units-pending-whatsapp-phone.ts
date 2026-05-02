import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Celular (WhatsApp) de referência na unidade quando ainda não há proprietário
 * nem responsável com ficha na base — preenchido pela gestão.
 */
export class UnitsPendingWhatsappPhone1751410000000 implements MigrationInterface {
  name = 'UnitsPendingWhatsappPhone1751410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`units\` ADD \`pending_whatsapp_phone\` varchar(16) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`units\` DROP COLUMN \`pending_whatsapp_phone\``,
    );
  }
}
