import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pessoas (ficha), convites por unidade, proprietário e responsável nas unidades.
 */
export class UnitPersonsAndInvitations1744500000000 implements MigrationInterface {
  name = 'UnitPersonsAndInvitations1744500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await this.upPostgres(queryRunner);
    } else {
      await this.upMysql(queryRunner);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await this.downPostgres(queryRunner);
    } else {
      await this.downMysql(queryRunner);
    }
  }

  private async upMysql(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TABLE \`people\` (
  \`id\` varchar(36) NOT NULL,
  \`cpf\` varchar(11) NULL,
  \`email\` varchar(255) NULL,
  \`full_name\` varchar(255) NOT NULL,
  \`phone\` varchar(50) NULL,
  \`user_id\` varchar(36) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_people_cpf\` (\`cpf\`),
  UNIQUE KEY \`UQ_people_email\` (\`email\`),
  KEY \`FK_people_user_id\` (\`user_id\`),
  CONSTRAINT \`FK_people_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`unit_invitations\` (
  \`id\` varchar(36) NOT NULL,
  \`token_hash\` varchar(64) NOT NULL,
  \`email\` varchar(255) NOT NULL,
  \`cpf\` varchar(11) NULL,
  \`person_id\` varchar(36) NOT NULL,
  \`unit_id\` varchar(36) NOT NULL,
  \`as_owner\` tinyint(1) NOT NULL DEFAULT 0,
  \`as_responsible\` tinyint(1) NOT NULL DEFAULT 0,
  \`invited_by_user_id\` varchar(36) NOT NULL,
  \`expires_at\` datetime(6) NOT NULL,
  \`consumed_at\` datetime(6) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_unit_invitations_token_hash\` (\`token_hash\`),
  KEY \`FK_unit_invitations_person\` (\`person_id\`),
  KEY \`FK_unit_invitations_unit\` (\`unit_id\`),
  KEY \`FK_unit_invitations_inviter\` (\`invited_by_user_id\`),
  CONSTRAINT \`FK_unit_invitations_person\` FOREIGN KEY (\`person_id\`) REFERENCES \`people\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_unit_invitations_unit\` FOREIGN KEY (\`unit_id\`) REFERENCES \`units\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_unit_invitations_inviter\` FOREIGN KEY (\`invited_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
ALTER TABLE \`units\`
  ADD COLUMN \`owner_person_id\` varchar(36) NULL,
  ADD COLUMN \`responsible_person_id\` varchar(36) NULL,
  ADD KEY \`FK_units_owner_person\` (\`owner_person_id\`),
  ADD KEY \`FK_units_responsible_person\` (\`responsible_person_id\`),
  ADD CONSTRAINT \`FK_units_owner_person\` FOREIGN KEY (\`owner_person_id\`) REFERENCES \`people\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT \`FK_units_responsible_person\` FOREIGN KEY (\`responsible_person_id\`) REFERENCES \`people\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
`);
  }

  private async downMysql(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `units` DROP FOREIGN KEY `FK_units_responsible_person`',
    );
    await queryRunner.query(
      'ALTER TABLE `units` DROP FOREIGN KEY `FK_units_owner_person`',
    );
    await queryRunner.query(
      'ALTER TABLE `units` DROP COLUMN `responsible_person_id`, DROP COLUMN `owner_person_id`',
    );
    await queryRunner.query('DROP TABLE IF EXISTS `unit_invitations`');
    await queryRunner.query('DROP TABLE IF EXISTS `people`');
  }

  private async upPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TABLE "people" (
  "id" varchar(36) NOT NULL,
  "cpf" varchar(11) NULL,
  "email" varchar(255) NULL,
  "full_name" varchar(255) NOT NULL,
  "phone" varchar(50) NULL,
  "user_id" varchar(36) NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_people" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_people_cpf" UNIQUE ("cpf"),
  CONSTRAINT "UQ_people_email" UNIQUE ("email"),
  CONSTRAINT "FK_people_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
)
`);
    await queryRunner.query(
      'CREATE INDEX "IDX_people_user_id" ON "people" ("user_id")',
    );
    await queryRunner.query(`
CREATE TABLE "unit_invitations" (
  "id" varchar(36) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "email" varchar(255) NOT NULL,
  "cpf" varchar(11) NULL,
  "person_id" varchar(36) NOT NULL,
  "unit_id" varchar(36) NOT NULL,
  "as_owner" boolean NOT NULL DEFAULT false,
  "as_responsible" boolean NOT NULL DEFAULT false,
  "invited_by_user_id" varchar(36) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_unit_invitations" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_unit_invitations_token_hash" UNIQUE ("token_hash"),
  CONSTRAINT "FK_unit_invitations_person" FOREIGN KEY ("person_id") REFERENCES "people" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_unit_invitations_unit" FOREIGN KEY ("unit_id") REFERENCES "units" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_unit_invitations_inviter" FOREIGN KEY ("invited_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
    await queryRunner.query(
      'CREATE INDEX "IDX_unit_invitations_person" ON "unit_invitations" ("person_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_unit_invitations_unit" ON "unit_invitations" ("unit_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_unit_invitations_inviter" ON "unit_invitations" ("invited_by_user_id")',
    );
    await queryRunner.query(`
ALTER TABLE "units"
  ADD COLUMN "owner_person_id" varchar(36) NULL,
  ADD COLUMN "responsible_person_id" varchar(36) NULL
`);
    await queryRunner.query(`
ALTER TABLE "units"
  ADD CONSTRAINT "FK_units_owner_person" FOREIGN KEY ("owner_person_id") REFERENCES "people" ("id") ON DELETE SET NULL ON UPDATE CASCADE
`);
    await queryRunner.query(`
ALTER TABLE "units"
  ADD CONSTRAINT "FK_units_responsible_person" FOREIGN KEY ("responsible_person_id") REFERENCES "people" ("id") ON DELETE SET NULL ON UPDATE CASCADE
`);
  }

  private async downPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "FK_units_responsible_person"',
    );
    await queryRunner.query(
      'ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "FK_units_owner_person"',
    );
    await queryRunner.query(
      'ALTER TABLE "units" DROP COLUMN IF EXISTS "responsible_person_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "units" DROP COLUMN IF EXISTS "owner_person_id"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "unit_invitations"');
    await queryRunner.query('DROP TABLE IF EXISTS "people"');
  }
}
