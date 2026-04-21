import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunicationReadLinks1751100000000 implements MigrationInterface {
  name = 'CommunicationReadLinks1751100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "communication_read_links" (
  "id" varchar(36) NOT NULL,
  "communication_id" varchar(36) NOT NULL,
  "user_id" varchar(36) NOT NULL,
  "unit_id" varchar(36) NOT NULL,
  "channel" varchar(16) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_communication_read_links" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_crl_token_hash" UNIQUE ("token_hash"),
  CONSTRAINT "FK_crl_comm" FOREIGN KEY ("communication_id")
    REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_crl_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_crl_unit" FOREIGN KEY ("unit_id")
    REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_crl_comm_user_unit_ch" ON "communication_read_links"
  ("communication_id", "user_id", "unit_id", "channel")
`);
      return;
    }

    await queryRunner.query(`
CREATE TABLE \`communication_read_links\` (
  \`id\` varchar(36) NOT NULL,
  \`communication_id\` varchar(36) NOT NULL,
  \`user_id\` varchar(36) NOT NULL,
  \`unit_id\` varchar(36) NOT NULL,
  \`channel\` varchar(16) NOT NULL,
  \`token_hash\` varchar(64) NOT NULL,
  \`expires_at\` datetime(6) NOT NULL,
  \`consumed_at\` datetime(6) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_crl_token_hash\` (\`token_hash\`),
  KEY \`IDX_crl_comm_user_unit_ch\` (\`communication_id\`, \`user_id\`, \`unit_id\`, \`channel\`),
  KEY \`FK_crl_comm\` (\`communication_id\`),
  KEY \`FK_crl_user\` (\`user_id\`),
  KEY \`FK_crl_unit\` (\`unit_id\`),
  CONSTRAINT \`FK_crl_comm\` FOREIGN KEY (\`communication_id\`)
    REFERENCES \`communications\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_crl_user\` FOREIGN KEY (\`user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_crl_unit\` FOREIGN KEY (\`unit_id\`)
    REFERENCES \`units\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE IF EXISTS "communication_read_links"`);
      return;
    }
    await queryRunner.query(`DROP TABLE IF EXISTS \`communication_read_links\``);
  }
}
