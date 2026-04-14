import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumInvitationPlainToken1750170000000
  implements MigrationInterface
{
  name = 'CondominiumInvitationPlainToken1750170000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const t = 'condominium_invitations';
    const col = 'invite_token_plain';

    if (dialect === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "${t}" ADD COLUMN "${col}" varchar(64) NULL`,
      );
    } else {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` ADD COLUMN \`${col}\` varchar(64) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const t = 'condominium_invitations';
    const col = 'invite_token_plain';

    if (dialect === 'postgres') {
      await queryRunner.query(`ALTER TABLE "${t}" DROP COLUMN "${col}"`);
    } else {
      await queryRunner.query(`ALTER TABLE \`${t}\` DROP COLUMN \`${col}\``);
    }
  }
}
