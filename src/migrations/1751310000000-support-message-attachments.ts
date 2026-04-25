import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportMessageAttachments1751310000000 implements MigrationInterface {
  name = 'SupportMessageAttachments1751310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "support_ticket_messages"
  ADD COLUMN "attachments_json" text NULL
`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`support_ticket_messages\`
  ADD COLUMN \`attachments_json\` text NULL
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "support_ticket_messages" DROP COLUMN "attachments_json"`,
      );
      return;
    }
    await queryRunner.query(
      `ALTER TABLE \`support_ticket_messages\` DROP COLUMN \`attachments_json\``,
    );
  }
}
