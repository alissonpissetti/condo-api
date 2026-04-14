import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convites ao condomínio passam a estar ligados a uma unidade; ao aceitar,
 * a pessoa torna-se responsável pela unidade.
 * Remove convites pendentes antigos sem unidade (formato anterior).
 */
export class CondominiumInvitationsUnit1750160000000 implements MigrationInterface {
  name = 'CondominiumInvitationsUnit1750160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;

    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_invitations" ADD COLUMN "unit_id" varchar(36) NULL
`);
      await queryRunner.query(`
DELETE FROM "condominium_invitations" WHERE "unit_id" IS NULL
`);
      await queryRunner.query(`
ALTER TABLE "condominium_invitations" ALTER COLUMN "unit_id" SET NOT NULL
`);
      await queryRunner.query(`
ALTER TABLE "condominium_invitations"
  ADD CONSTRAINT "FK_condo_inv_unit" FOREIGN KEY ("unit_id")
    REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE
`);
      await queryRunner.query(`
CREATE INDEX "IDX_condo_inv_unit" ON "condominium_invitations" ("unit_id")
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominium_invitations\` ADD COLUMN \`unit_id\` varchar(36) NULL
`);
      await queryRunner.query(`
DELETE FROM \`condominium_invitations\` WHERE \`unit_id\` IS NULL
`);
      await queryRunner.query(`
ALTER TABLE \`condominium_invitations\` MODIFY \`unit_id\` varchar(36) NOT NULL
`);
      await queryRunner.query(`
ALTER TABLE \`condominium_invitations\`
  ADD CONSTRAINT \`FK_condo_inv_unit\` FOREIGN KEY (\`unit_id\`)
    REFERENCES \`units\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const t = 'condominium_invitations';
    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "${t}" DROP CONSTRAINT IF EXISTS "FK_condo_inv_unit"`,
      );
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_condo_inv_unit"`);
      await queryRunner.query(
        `ALTER TABLE "${t}" DROP COLUMN IF EXISTS "unit_id"`,
      );
    } else {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` DROP FOREIGN KEY \`FK_condo_inv_unit\``,
      );
      await queryRunner.query(`ALTER TABLE \`${t}\` DROP COLUMN \`unit_id\``);
    }
  }
}
