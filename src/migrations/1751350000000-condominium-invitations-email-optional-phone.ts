import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permite convite por SMS (celular) sem e-mail;
 * e-mail do convite passa a ser opcional quando houver `phone`.
 */
export class CondominiumInvitationsEmailOptionalPhone1751350000000
  implements MigrationInterface
{
  name = 'CondominiumInvitationsEmailOptionalPhone1751350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const t = 'condominium_invitations';

    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "phone" character varying(20)`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t}" ALTER COLUMN "email" DROP NOT NULL`,
      );
    } else {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD COLUMN \`phone\` varchar(20) NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${t}\` MODIFY \`email\` varchar(255) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const t = 'condominium_invitations';

    if (dialect === 'postgres') {
      await queryRunner.query(
        `UPDATE "${t}" SET "email" = 'pendente@invalido' WHERE "email" IS NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t}" ALTER COLUMN "email" SET NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t}" DROP COLUMN IF EXISTS "phone"`,
      );
    } else {
      await queryRunner.query(
        `UPDATE \`${t}\` SET \`email\` = 'pendente@invalido' WHERE \`email\` IS NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${t}\` MODIFY \`email\` varchar(255) NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${t}\` DROP COLUMN \`phone\``,
      );
    }
  }
}
