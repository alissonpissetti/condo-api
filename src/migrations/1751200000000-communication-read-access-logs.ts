import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunicationReadAccessLogs1751200000000
  implements MigrationInterface
{
  name = 'CommunicationReadAccessLogs1751200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "communication_read_access_logs" (
  "id" varchar(36) NOT NULL,
  "communication_id" varchar(36) NOT NULL,
  "user_id" varchar(36) NOT NULL,
  "unit_id" varchar(36) NULL,
  "channel" varchar(24) NOT NULL,
  "kind" varchar(24) NOT NULL DEFAULT 'public_view',
  "read_link_id" varchar(36) NULL,
  "accessed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_communication_read_access_logs" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cral_comm" FOREIGN KEY ("communication_id")
    REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cral_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cral_link" FOREIGN KEY ("read_link_id")
    REFERENCES "communication_read_links"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FK_cral_unit" FOREIGN KEY ("unit_id")
    REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cral_comm_accessed" ON "communication_read_access_logs" ("communication_id", "accessed_at")
`);
      await queryRunner.query(`
ALTER TABLE "communication_read_links" ALTER COLUMN "expires_at" DROP NOT NULL
`);
      return;
    }

    await queryRunner.query(`
CREATE TABLE \`communication_read_access_logs\` (
  \`id\` varchar(36) NOT NULL,
  \`communication_id\` varchar(36) NOT NULL,
  \`user_id\` varchar(36) NOT NULL,
  \`unit_id\` varchar(36) NULL,
  \`channel\` varchar(24) NOT NULL,
  \`kind\` varchar(24) NOT NULL DEFAULT 'public_view',
  \`read_link_id\` varchar(36) NULL,
  \`accessed_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_cral_comm_accessed\` (\`communication_id\`, \`accessed_at\`),
  KEY \`FK_cral_comm\` (\`communication_id\`),
  KEY \`FK_cral_user\` (\`user_id\`),
  KEY \`FK_cral_link\` (\`read_link_id\`),
  KEY \`FK_cral_unit\` (\`unit_id\`),
  CONSTRAINT \`FK_cral_comm\` FOREIGN KEY (\`communication_id\`)
    REFERENCES \`communications\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cral_user\` FOREIGN KEY (\`user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cral_link\` FOREIGN KEY (\`read_link_id\`)
    REFERENCES \`communication_read_links\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`FK_cral_unit\` FOREIGN KEY (\`unit_id\`)
    REFERENCES \`units\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
ALTER TABLE \`communication_read_links\` MODIFY COLUMN \`expires_at\` datetime(6) NULL
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE IF EXISTS "communication_read_access_logs"`);
      await queryRunner.query(`
ALTER TABLE "communication_read_links" ALTER COLUMN "expires_at" SET NOT NULL
`);
      return;
    }
    await queryRunner.query(`DROP TABLE IF EXISTS \`communication_read_access_logs\``);
    await queryRunner.query(`
ALTER TABLE \`communication_read_links\` MODIFY COLUMN \`expires_at\` datetime(6) NOT NULL
`);
  }
}
