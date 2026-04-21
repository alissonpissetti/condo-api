import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunicationDisplayNames1751210000000 implements MigrationInterface {
  name = 'CommunicationDisplayNames1751210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "communication_recipients"
  ADD COLUMN "recipient_display_name" varchar(255) NULL
`);
      await queryRunner.query(`
ALTER TABLE "communication_read_access_logs"
  ADD COLUMN "reader_display_name" varchar(255) NULL
`);
      await queryRunner.query(`
ALTER TABLE "communications"
  ADD COLUMN "last_broadcast_user_id" varchar(36) NULL,
  ADD COLUMN "last_broadcast_user_name" varchar(255) NULL
`);
      return;
    }

    await queryRunner.query(`
ALTER TABLE \`communication_recipients\`
  ADD COLUMN \`recipient_display_name\` varchar(255) NULL
`);
    await queryRunner.query(`
ALTER TABLE \`communication_read_access_logs\`
  ADD COLUMN \`reader_display_name\` varchar(255) NULL
`);
    await queryRunner.query(`
ALTER TABLE \`communications\`
  ADD COLUMN \`last_broadcast_user_id\` varchar(36) NULL,
  ADD COLUMN \`last_broadcast_user_name\` varchar(255) NULL
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "communication_recipients" DROP COLUMN IF EXISTS "recipient_display_name"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communication_read_access_logs" DROP COLUMN IF EXISTS "reader_display_name"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "last_broadcast_user_name"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "last_broadcast_user_id"`,
      );
      return;
    }
    await queryRunner.query(
      `ALTER TABLE \`communication_recipients\` DROP COLUMN \`recipient_display_name\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communication_read_access_logs\` DROP COLUMN \`reader_display_name\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`last_broadcast_user_name\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`last_broadcast_user_id\``,
    );
  }
}
