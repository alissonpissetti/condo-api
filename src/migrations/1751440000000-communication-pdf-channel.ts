import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunicationPdfChannel1751440000000 implements MigrationInterface {
  name = 'CommunicationPdfChannel1751440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "communications"
  ADD COLUMN "channel_pdf_enabled" boolean NOT NULL DEFAULT false
`);
      await queryRunner.query(`
ALTER TABLE "communication_recipients"
  ADD COLUMN "pdf_status" varchar(16) NOT NULL DEFAULT 'skipped'
`);
      return;
    }

    await queryRunner.query(`
ALTER TABLE \`communications\`
  ADD COLUMN \`channel_pdf_enabled\` tinyint(1) NOT NULL DEFAULT 0
`);
    await queryRunner.query(`
ALTER TABLE \`communication_recipients\`
  ADD COLUMN \`pdf_status\` varchar(16) NOT NULL DEFAULT 'skipped'
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "communication_recipients" DROP COLUMN IF EXISTS "pdf_status"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "channel_pdf_enabled"`,
      );
      return;
    }

    await queryRunner.query(
      `ALTER TABLE \`communication_recipients\` DROP COLUMN \`pdf_status\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`channel_pdf_enabled\``,
    );
  }
}
