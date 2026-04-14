import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PlanningGovernanceDocuments1750000000000
  implements MigrationInterface
{
  name = 'PlanningGovernanceDocuments1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_participants" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "user_id" varchar(36) NOT NULL,
  "person_id" varchar(36) NULL,
  "role" varchar(16) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_participants" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_condo_participant_user_role" UNIQUE ("condominium_id", "user_id", "role"),
  CONSTRAINT "FK_cp_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cp_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cp_person" FOREIGN KEY ("person_id")
    REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cp_condo_role" ON "condominium_participants" ("condominium_id", "role")
`);
      await queryRunner.query(`
CREATE TABLE "planning_polls" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "title" varchar(512) NOT NULL,
  "body" text NULL,
  "opens_at" TIMESTAMPTZ NOT NULL,
  "closes_at" TIMESTAMPTZ NOT NULL,
  "status" varchar(16) NOT NULL,
  "assembly_type" varchar(16) NOT NULL,
  "decided_option_id" varchar(36) NULL,
  "created_by_user_id" varchar(36) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_planning_polls" PRIMARY KEY ("id"),
  CONSTRAINT "FK_pp_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_pp_creator" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE TABLE "planning_poll_options" (
  "id" varchar(36) NOT NULL,
  "poll_id" varchar(36) NOT NULL,
  "label" varchar(512) NOT NULL,
  "sort_order" int NOT NULL DEFAULT 0,
  CONSTRAINT "PK_planning_poll_options" PRIMARY KEY ("id"),
  CONSTRAINT "FK_ppo_poll" FOREIGN KEY ("poll_id")
    REFERENCES "planning_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE TABLE "planning_poll_votes" (
  "id" varchar(36) NOT NULL,
  "poll_id" varchar(36) NOT NULL,
  "unit_id" varchar(36) NOT NULL,
  "option_id" varchar(36) NOT NULL,
  "cast_by_user_id" varchar(36) NOT NULL,
  "cast_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_planning_poll_votes" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_poll_unit_vote" UNIQUE ("poll_id", "unit_id"),
  CONSTRAINT "FK_ppv_poll" FOREIGN KEY ("poll_id")
    REFERENCES "planning_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_ppv_unit" FOREIGN KEY ("unit_id")
    REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_ppv_option" FOREIGN KEY ("option_id")
    REFERENCES "planning_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_ppv_user" FOREIGN KEY ("cast_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE TABLE "condominium_documents" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "kind" varchar(32) NOT NULL,
  "status" varchar(24) NOT NULL,
  "title" varchar(512) NOT NULL,
  "storage_key" varchar(512) NULL,
  "mime_type" varchar(128) NULL,
  "poll_id" varchar(36) NULL,
  "visible_to_all_residents" boolean NOT NULL DEFAULT false,
  "created_by_user_id" varchar(36) NOT NULL,
  "election_payload" jsonb NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_documents" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cd_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_cd_poll" FOREIGN KEY ("poll_id")
    REFERENCES "planning_polls"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FK_cd_creator" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE TABLE "governance_audit_logs" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "action" varchar(64) NOT NULL,
  "performed_by_user_id" varchar(36) NOT NULL,
  "payload" jsonb NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_governance_audit_logs" PRIMARY KEY ("id"),
  CONSTRAINT "FK_gal_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_gal_user" FOREIGN KEY ("performed_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
      return;
    }

    await queryRunner.query(`
CREATE TABLE \`condominium_participants\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`user_id\` varchar(36) NOT NULL,
  \`person_id\` varchar(36) NULL,
  \`role\` varchar(16) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_condo_participant_user_role\` (\`condominium_id\`, \`user_id\`, \`role\`),
  KEY \`FK_cp_person\` (\`person_id\`),
  KEY \`IDX_cp_condo_role\` (\`condominium_id\`, \`role\`),
  CONSTRAINT \`FK_cp_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cp_user\` FOREIGN KEY (\`user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cp_person\` FOREIGN KEY (\`person_id\`)
    REFERENCES \`people\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`planning_polls\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`title\` varchar(512) NOT NULL,
  \`body\` text NULL,
  \`opens_at\` datetime(6) NOT NULL,
  \`closes_at\` datetime(6) NOT NULL,
  \`status\` varchar(16) NOT NULL,
  \`assembly_type\` varchar(16) NOT NULL,
  \`decided_option_id\` varchar(36) NULL,
  \`created_by_user_id\` varchar(36) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`FK_pp_condo\` (\`condominium_id\`),
  KEY \`FK_pp_creator\` (\`created_by_user_id\`),
  CONSTRAINT \`FK_pp_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_pp_creator\` FOREIGN KEY (\`created_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`planning_poll_options\` (
  \`id\` varchar(36) NOT NULL,
  \`poll_id\` varchar(36) NOT NULL,
  \`label\` varchar(512) NOT NULL,
  \`sort_order\` int NOT NULL DEFAULT 0,
  PRIMARY KEY (\`id\`),
  KEY \`FK_ppo_poll\` (\`poll_id\`),
  CONSTRAINT \`FK_ppo_poll\` FOREIGN KEY (\`poll_id\`)
    REFERENCES \`planning_polls\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`planning_poll_votes\` (
  \`id\` varchar(36) NOT NULL,
  \`poll_id\` varchar(36) NOT NULL,
  \`unit_id\` varchar(36) NOT NULL,
  \`option_id\` varchar(36) NOT NULL,
  \`cast_by_user_id\` varchar(36) NOT NULL,
  \`cast_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_poll_unit_vote\` (\`poll_id\`, \`unit_id\`),
  KEY \`FK_ppv_unit\` (\`unit_id\`),
  KEY \`FK_ppv_option\` (\`option_id\`),
  KEY \`FK_ppv_user\` (\`cast_by_user_id\`),
  CONSTRAINT \`FK_ppv_poll\` FOREIGN KEY (\`poll_id\`)
    REFERENCES \`planning_polls\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_ppv_unit\` FOREIGN KEY (\`unit_id\`)
    REFERENCES \`units\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_ppv_option\` FOREIGN KEY (\`option_id\`)
    REFERENCES \`planning_poll_options\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_ppv_user\` FOREIGN KEY (\`cast_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`condominium_documents\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`kind\` varchar(32) NOT NULL,
  \`status\` varchar(24) NOT NULL,
  \`title\` varchar(512) NOT NULL,
  \`storage_key\` varchar(512) NULL,
  \`mime_type\` varchar(128) NULL,
  \`poll_id\` varchar(36) NULL,
  \`visible_to_all_residents\` tinyint NOT NULL DEFAULT 0,
  \`created_by_user_id\` varchar(36) NOT NULL,
  \`election_payload\` json NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`FK_cd_condo\` (\`condominium_id\`),
  KEY \`FK_cd_poll\` (\`poll_id\`),
  KEY \`FK_cd_creator\` (\`created_by_user_id\`),
  CONSTRAINT \`FK_cd_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_cd_poll\` FOREIGN KEY (\`poll_id\`)
    REFERENCES \`planning_polls\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`FK_cd_creator\` FOREIGN KEY (\`created_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`governance_audit_logs\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`action\` varchar(64) NOT NULL,
  \`performed_by_user_id\` varchar(36) NOT NULL,
  \`payload\` json NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`FK_gal_condo\` (\`condominium_id\`),
  KEY \`FK_gal_user\` (\`performed_by_user_id\`),
  CONSTRAINT \`FK_gal_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_gal_user\` FOREIGN KEY (\`performed_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const tables = [
      'governance_audit_logs',
      'condominium_documents',
      'planning_poll_votes',
      'planning_poll_options',
      'planning_polls',
      'condominium_participants',
    ];
    for (const t of tables) {
      await queryRunner.query(
        dialect === 'postgres'
          ? `DROP TABLE IF EXISTS "${t}" CASCADE`
          : `DROP TABLE IF EXISTS \`${t}\``,
      );
    }
  }
}
