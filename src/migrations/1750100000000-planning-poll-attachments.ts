import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanningPollAttachments1750100000000 implements MigrationInterface {
  name = 'PlanningPollAttachments1750100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;

    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "planning_poll_attachments" (
  "id" varchar(36) NOT NULL,
  "poll_id" varchar(36) NOT NULL,
  "storage_key" varchar(512) NOT NULL,
  "original_filename" varchar(512) NOT NULL,
  "mime_type" varchar(128) NOT NULL,
  "size_bytes" int NOT NULL,
  "sort_order" int NOT NULL DEFAULT 0,
  "uploaded_by_user_id" varchar(36) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_planning_poll_attachments" PRIMARY KEY ("id"),
  CONSTRAINT "FK_ppa_poll" FOREIGN KEY ("poll_id")
    REFERENCES "planning_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_ppa_user" FOREIGN KEY ("uploaded_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_ppa_poll_sort" ON "planning_poll_attachments" ("poll_id", "sort_order")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`planning_poll_attachments\` (
  \`id\` varchar(36) NOT NULL,
  \`poll_id\` varchar(36) NOT NULL,
  \`storage_key\` varchar(512) NOT NULL,
  \`original_filename\` varchar(512) NOT NULL,
  \`mime_type\` varchar(128) NOT NULL,
  \`size_bytes\` int NOT NULL,
  \`sort_order\` int NOT NULL DEFAULT 0,
  \`uploaded_by_user_id\` varchar(36) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_ppa_poll_sort\` (\`poll_id\`, \`sort_order\`),
  KEY \`FK_ppa_user\` (\`uploaded_by_user_id\`),
  CONSTRAINT \`FK_ppa_poll\` FOREIGN KEY (\`poll_id\`)
    REFERENCES \`planning_polls\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_ppa_user\` FOREIGN KEY (\`uploaded_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const t = 'planning_poll_attachments';
    await queryRunner.query(
      dialect === 'postgres'
        ? `DROP TABLE IF EXISTS "${t}" CASCADE`
        : `DROP TABLE IF EXISTS \`${t}\``,
    );
  }
}
