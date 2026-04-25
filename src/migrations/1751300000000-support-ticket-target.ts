import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportTicketTarget1751300000000 implements MigrationInterface {
  name = 'SupportTicketTarget1751300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "support_tickets"
  ADD COLUMN "target" varchar(20) NOT NULL DEFAULT 'platform'
`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`support_tickets\`
  ADD COLUMN \`target\` varchar(20) NOT NULL DEFAULT 'platform'
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`ALTER TABLE "support_tickets" DROP COLUMN "target"`);
      return;
    }
    await queryRunner.query(
      `ALTER TABLE \`support_tickets\` DROP COLUMN \`target\``,
    );
  }
}
