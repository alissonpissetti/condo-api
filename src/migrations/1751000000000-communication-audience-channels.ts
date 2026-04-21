import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunicationAudienceChannels1751000000000
  implements MigrationInterface
{
  name = 'CommunicationAudienceChannels1751000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "communications" ADD COLUMN "audience_scope" varchar(32) NOT NULL DEFAULT 'units'`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" ADD COLUMN "audience_unit_ids" text NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" ADD COLUMN "audience_grouping_ids" text NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" ADD COLUMN "channel_email_enabled" boolean NOT NULL DEFAULT true`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" ADD COLUMN "channel_sms_enabled" boolean NOT NULL DEFAULT true`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" ADD COLUMN "channel_whatsapp_enabled" boolean NOT NULL DEFAULT false`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" ADD COLUMN "recipient_delivery_prefs" text NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "communication_recipients" ADD COLUMN "whatsapp_status" varchar(16) NOT NULL DEFAULT 'skipped'`,
      );
      await queryRunner.query(
        `ALTER TABLE "communication_recipients" ADD COLUMN "whatsapp_error" text NULL`,
      );
      return;
    }

    await queryRunner.query(`
ALTER TABLE \`communications\`
  ADD COLUMN \`audience_scope\` varchar(32) NOT NULL DEFAULT 'units',
  ADD COLUMN \`audience_unit_ids\` text NULL,
  ADD COLUMN \`audience_grouping_ids\` text NULL,
  ADD COLUMN \`channel_email_enabled\` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN \`channel_sms_enabled\` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN \`channel_whatsapp_enabled\` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN \`recipient_delivery_prefs\` text NULL
`);
    await queryRunner.query(`
ALTER TABLE \`communication_recipients\`
  ADD COLUMN \`whatsapp_status\` varchar(16) NOT NULL DEFAULT 'skipped',
  ADD COLUMN \`whatsapp_error\` text NULL
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "communication_recipients" DROP COLUMN IF EXISTS "whatsapp_error"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communication_recipients" DROP COLUMN IF EXISTS "whatsapp_status"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "recipient_delivery_prefs"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "channel_whatsapp_enabled"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "channel_sms_enabled"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "channel_email_enabled"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "audience_grouping_ids"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "audience_unit_ids"`,
      );
      await queryRunner.query(
        `ALTER TABLE "communications" DROP COLUMN IF EXISTS "audience_scope"`,
      );
      return;
    }
    await queryRunner.query(
      `ALTER TABLE \`communication_recipients\` DROP COLUMN \`whatsapp_error\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communication_recipients\` DROP COLUMN \`whatsapp_status\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`recipient_delivery_prefs\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`channel_whatsapp_enabled\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`channel_sms_enabled\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`channel_email_enabled\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`audience_grouping_ids\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`audience_unit_ids\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`communications\` DROP COLUMN \`audience_scope\``,
    );
  }
}
