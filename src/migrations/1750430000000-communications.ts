import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Communications1750430000000 implements MigrationInterface {
  name = 'Communications1750430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "communications" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "title" varchar(512) NOT NULL,
  "body" text NULL,
  "status" varchar(16) NOT NULL DEFAULT 'draft',
  "created_by_user_id" varchar(36) NOT NULL,
  "sent_at" TIMESTAMPTZ NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_communications" PRIMARY KEY ("id"),
  CONSTRAINT "FK_comm_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_comm_creator" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_comm_condo_status" ON "communications" ("condominium_id", "status")
`);
      await queryRunner.query(`
CREATE TABLE "communication_attachments" (
  "id" varchar(36) NOT NULL,
  "communication_id" varchar(36) NOT NULL,
  "storage_key" varchar(512) NOT NULL,
  "mime_type" varchar(128) NOT NULL,
  "original_filename" varchar(500) NOT NULL,
  "size_bytes" int NOT NULL,
  "sort_order" int NOT NULL DEFAULT 0,
  "uploaded_by_user_id" varchar(36) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_communication_attachments" PRIMARY KEY ("id"),
  CONSTRAINT "FK_ca_comm" FOREIGN KEY ("communication_id")
    REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_ca_uploader" FOREIGN KEY ("uploaded_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_ca_comm" ON "communication_attachments" ("communication_id")
`);
      await queryRunner.query(`
CREATE TABLE "communication_recipients" (
  "id" varchar(36) NOT NULL,
  "communication_id" varchar(36) NOT NULL,
  "user_id" varchar(36) NOT NULL,
  "email_snapshot" varchar(255) NULL,
  "phone_snapshot" varchar(20) NULL,
  "email_status" varchar(16) NOT NULL DEFAULT 'pending',
  "sms_status" varchar(16) NOT NULL DEFAULT 'pending',
  "email_error" text NULL,
  "sms_error" text NULL,
  "email_token_hash" varchar(64) NULL,
  "email_token_expires_at" TIMESTAMPTZ NULL,
  "read_at" TIMESTAMPTZ NULL,
  "read_source" varchar(16) NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_communication_recipients" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_comm_recipient_user" UNIQUE ("communication_id", "user_id"),
  CONSTRAINT "FK_cr_comm" FOREIGN KEY ("communication_id")
    REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cr_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cr_user_comm" ON "communication_recipients" ("user_id", "communication_id")
`);
      return;
    }

    await queryRunner.query(`
CREATE TABLE \`communications\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`title\` varchar(512) NOT NULL,
  \`body\` text NULL,
  \`status\` varchar(16) NOT NULL DEFAULT 'draft',
  \`created_by_user_id\` varchar(36) NOT NULL,
  \`sent_at\` datetime(6) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`FK_comm_condo\` (\`condominium_id\`),
  KEY \`FK_comm_creator\` (\`created_by_user_id\`),
  KEY \`IDX_comm_condo_status\` (\`condominium_id\`, \`status\`),
  CONSTRAINT \`FK_comm_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_comm_creator\` FOREIGN KEY (\`created_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`communication_attachments\` (
  \`id\` varchar(36) NOT NULL,
  \`communication_id\` varchar(36) NOT NULL,
  \`storage_key\` varchar(512) NOT NULL,
  \`mime_type\` varchar(128) NOT NULL,
  \`original_filename\` varchar(500) NOT NULL,
  \`size_bytes\` int NOT NULL,
  \`sort_order\` int NOT NULL DEFAULT 0,
  \`uploaded_by_user_id\` varchar(36) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_ca_comm\` (\`communication_id\`),
  KEY \`FK_ca_uploader\` (\`uploaded_by_user_id\`),
  CONSTRAINT \`FK_ca_comm\` FOREIGN KEY (\`communication_id\`)
    REFERENCES \`communications\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_ca_uploader\` FOREIGN KEY (\`uploaded_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`communication_recipients\` (
  \`id\` varchar(36) NOT NULL,
  \`communication_id\` varchar(36) NOT NULL,
  \`user_id\` varchar(36) NOT NULL,
  \`email_snapshot\` varchar(255) NULL,
  \`phone_snapshot\` varchar(20) NULL,
  \`email_status\` varchar(16) NOT NULL DEFAULT 'pending',
  \`sms_status\` varchar(16) NOT NULL DEFAULT 'pending',
  \`email_error\` text NULL,
  \`sms_error\` text NULL,
  \`email_token_hash\` varchar(64) NULL,
  \`email_token_expires_at\` datetime(6) NULL,
  \`read_at\` datetime(6) NULL,
  \`read_source\` varchar(16) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_comm_recipient_user\` (\`communication_id\`, \`user_id\`),
  KEY \`IDX_cr_user_comm\` (\`user_id\`, \`communication_id\`),
  CONSTRAINT \`FK_cr_comm\` FOREIGN KEY (\`communication_id\`)
    REFERENCES \`communications\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cr_user\` FOREIGN KEY (\`user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE IF EXISTS "communication_recipients"`);
      await queryRunner.query(`DROP TABLE IF EXISTS "communication_attachments"`);
      await queryRunner.query(`DROP TABLE IF EXISTS "communications"`);
      return;
    }
    await queryRunner.query(`DROP TABLE IF EXISTS \`communication_recipients\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`communication_attachments\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`communications\``);
  }
}
