import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportTicketMessagesViewToken1751230000000 implements MigrationInterface {
  name = 'SupportTicketMessagesViewToken1751230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "support_tickets"
  ADD COLUMN "view_token" varchar(64) NULL
`);
      await queryRunner.query(`
UPDATE "support_tickets"
SET "view_token" = encode(gen_random_bytes(32), 'hex')
WHERE "view_token" IS NULL
`);
      await queryRunner.query(`
ALTER TABLE "support_tickets"
  ALTER COLUMN "view_token" SET NOT NULL
`);
      await queryRunner.query(`
CREATE UNIQUE INDEX "UQ_support_tickets_view_token" ON "support_tickets" ("view_token")
`);
      await queryRunner.query(`
CREATE TABLE "support_ticket_messages" (
  "id" varchar(36) NOT NULL,
  "ticket_id" varchar(36) NOT NULL,
  "author_user_id" varchar(36) NOT NULL,
  "from_platform_admin" boolean NOT NULL DEFAULT false,
  "body" text NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_support_ticket_messages" PRIMARY KEY ("id"),
  CONSTRAINT "FK_stm_ticket" FOREIGN KEY ("ticket_id")
    REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_stm_author" FOREIGN KEY ("author_user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_stm_ticket_created" ON "support_ticket_messages" ("ticket_id", "created_at")
`);
      return;
    }

    await queryRunner.query(`
ALTER TABLE \`support_tickets\`
  ADD COLUMN \`view_token\` varchar(64) NULL
`);
    await queryRunner.query(`
UPDATE \`support_tickets\`
SET \`view_token\` = CONCAT(REPLACE(UUID(),'-',''), REPLACE(UUID(),'-',''))
WHERE \`view_token\` IS NULL
`);
    await queryRunner.query(`
ALTER TABLE \`support_tickets\`
  MODIFY \`view_token\` varchar(64) NOT NULL
`);
    await queryRunner.query(`
CREATE UNIQUE INDEX \`UQ_support_tickets_view_token\` ON \`support_tickets\` (\`view_token\`)
`);
    await queryRunner.query(`
CREATE TABLE \`support_ticket_messages\` (
  \`id\` varchar(36) NOT NULL,
  \`ticket_id\` varchar(36) NOT NULL,
  \`author_user_id\` varchar(36) NOT NULL,
  \`from_platform_admin\` tinyint(1) NOT NULL DEFAULT 0,
  \`body\` text NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_stm_ticket_created\` (\`ticket_id\`, \`created_at\`),
  KEY \`FK_stm_author\` (\`author_user_id\`),
  CONSTRAINT \`FK_stm_ticket\` FOREIGN KEY (\`ticket_id\`)
    REFERENCES \`support_tickets\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_stm_author\` FOREIGN KEY (\`author_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE IF EXISTS "support_ticket_messages"`);
      await queryRunner.query(
        `DROP INDEX IF EXISTS "UQ_support_tickets_view_token"`,
      );
      await queryRunner.query(
        `ALTER TABLE "support_tickets" DROP COLUMN IF EXISTS "view_token"`,
      );
      return;
    }
    await queryRunner.query(`DROP TABLE IF EXISTS \`support_ticket_messages\``);
    await queryRunner.query(
      `ALTER TABLE \`support_tickets\` DROP INDEX \`UQ_support_tickets_view_token\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`support_tickets\` DROP COLUMN \`view_token\``,
    );
  }
}
