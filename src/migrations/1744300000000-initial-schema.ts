import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema inicial: users → condominiums → groupings → units.
 * Suporta MySQL/MariaDB (driver `mysql`) e PostgreSQL.
 */
export class InitialSchema1744300000000 implements MigrationInterface {
  name = 'InitialSchema1744300000000';

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
CREATE TABLE \`users\` (
  \`id\` varchar(36) NOT NULL,
  \`email\` varchar(255) NOT NULL,
  \`password_hash\` varchar(255) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_users_email\` (\`email\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`condominiums\` (
  \`id\` varchar(36) NOT NULL,
  \`owner_id\` varchar(36) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`FK_condominiums_owner_id\` (\`owner_id\`),
  CONSTRAINT \`FK_condominiums_owner_id\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`groupings\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`FK_groupings_condominium_id\` (\`condominium_id\`),
  CONSTRAINT \`FK_groupings_condominium_id\` FOREIGN KEY (\`condominium_id\`) REFERENCES \`condominiums\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    await queryRunner.query(`
CREATE TABLE \`units\` (
  \`id\` varchar(36) NOT NULL,
  \`grouping_id\` varchar(36) NOT NULL,
  \`identifier\` varchar(255) NOT NULL,
  \`floor\` varchar(255) NULL,
  \`notes\` text NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`FK_units_grouping_id\` (\`grouping_id\`),
  CONSTRAINT \`FK_units_grouping_id\` FOREIGN KEY (\`grouping_id\`) REFERENCES \`groupings\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  }

  private async downMysql(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `units`');
    await queryRunner.query('DROP TABLE IF EXISTS `groupings`');
    await queryRunner.query('DROP TABLE IF EXISTS `condominiums`');
    await queryRunner.query('DROP TABLE IF EXISTS `users`');
  }

  private async upPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TABLE "users" (
  "id" varchar(36) NOT NULL,
  "email" varchar(255) NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_users" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_users_email" UNIQUE ("email")
)
`);
    await queryRunner.query(`
CREATE TABLE "condominiums" (
  "id" varchar(36) NOT NULL,
  "owner_id" varchar(36) NOT NULL,
  "name" varchar(255) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominiums" PRIMARY KEY ("id"),
  CONSTRAINT "FK_condominiums_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
    await queryRunner.query(`
CREATE TABLE "groupings" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "name" varchar(255) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_groupings" PRIMARY KEY ("id"),
  CONSTRAINT "FK_groupings_condominium_id" FOREIGN KEY ("condominium_id") REFERENCES "condominiums" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
    await queryRunner.query(`
CREATE TABLE "units" (
  "id" varchar(36) NOT NULL,
  "grouping_id" varchar(36) NOT NULL,
  "identifier" varchar(255) NOT NULL,
  "floor" varchar(255) NULL,
  "notes" text NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_units" PRIMARY KEY ("id"),
  CONSTRAINT "FK_units_grouping_id" FOREIGN KEY ("grouping_id") REFERENCES "groupings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
  }

  private async downPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "units"');
    await queryRunner.query('DROP TABLE IF EXISTS "groupings"');
    await queryRunner.query('DROP TABLE IF EXISTS "condominiums"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
