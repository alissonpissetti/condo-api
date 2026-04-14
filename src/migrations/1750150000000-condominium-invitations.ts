import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumInvitations1750150000000 implements MigrationInterface {
  name = 'CondominiumInvitations1750150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;

    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_invitations" (
  "id" varchar(36) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "email" varchar(255) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "person_id" varchar(36) NOT NULL,
  "invited_by_user_id" varchar(36) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_invitations" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_condominium_invitations_token_hash" UNIQUE ("token_hash"),
  CONSTRAINT "FK_condo_inv_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_condo_inv_person" FOREIGN KEY ("person_id")
    REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_condo_inv_inviter" FOREIGN KEY ("invited_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_condo_inv_condo_pending"
  ON "condominium_invitations" ("condominium_id")
  WHERE "consumed_at" IS NULL
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`condominium_invitations\` (
  \`id\` varchar(36) NOT NULL,
  \`token_hash\` varchar(64) NOT NULL,
  \`email\` varchar(255) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`person_id\` varchar(36) NOT NULL,
  \`invited_by_user_id\` varchar(36) NOT NULL,
  \`expires_at\` datetime(6) NOT NULL,
  \`consumed_at\` datetime(6) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_condominium_invitations_token_hash\` (\`token_hash\`),
  KEY \`IDX_condo_inv_condo\` (\`condominium_id\`),
  KEY \`FK_condo_inv_inviter\` (\`invited_by_user_id\`),
  CONSTRAINT \`FK_condo_inv_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_condo_inv_person\` FOREIGN KEY (\`person_id\`)
    REFERENCES \`people\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_condo_inv_inviter\` FOREIGN KEY (\`invited_by_user_id\`)
    REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const t = 'condominium_invitations';
    await queryRunner.query(
      dialect === 'postgres'
        ? `DROP TABLE IF EXISTS "${t}" CASCADE`
        : `DROP TABLE IF EXISTS \`${t}\``,
    );
  }
}
