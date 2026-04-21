import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportTickets1751220000000 implements MigrationInterface {
  name = 'SupportTickets1751220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "support_tickets" (
  "id" varchar(36) NOT NULL,
  "user_id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NULL,
  "category" varchar(24) NOT NULL,
  "title" varchar(512) NOT NULL,
  "body" text NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_support_tickets" PRIMARY KEY ("id"),
  CONSTRAINT "FK_st_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_st_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_st_user_created" ON "support_tickets" ("user_id", "created_at" DESC)
`);
      return;
    }

    await queryRunner.query(`
CREATE TABLE \`support_tickets\` (
  \`id\` varchar(36) NOT NULL,
  \`user_id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NULL,
  \`category\` varchar(24) NOT NULL,
  \`title\` varchar(512) NOT NULL,
  \`body\` text NOT NULL,
  \`status\` varchar(16) NOT NULL DEFAULT 'open',
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_st_user_created\` (\`user_id\`, \`created_at\`),
  KEY \`FK_st_condo\` (\`condominium_id\`),
  CONSTRAINT \`FK_st_user\` FOREIGN KEY (\`user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_st_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE IF EXISTS "support_tickets"`);
      return;
    }
    await queryRunner.query(`DROP TABLE IF EXISTS \`support_tickets\``);
  }
}
