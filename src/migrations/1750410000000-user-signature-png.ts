import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserSignaturePng1750410000000 implements MigrationInterface {
  name = 'UserSignaturePng1750410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "users"
  ADD COLUMN "signature_png" bytea NULL,
  ADD COLUMN "signature_updated_at" TIMESTAMP(6) NULL
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`users\`
  ADD COLUMN \`signature_png\` LONGBLOB NULL,
  ADD COLUMN \`signature_updated_at\` datetime(6) NULL
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "signature_png"`);
      await queryRunner.query(
        `ALTER TABLE "users" DROP COLUMN "signature_updated_at"`,
      );
    } else {
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`signature_png\``);
      await queryRunner.query(
        `ALTER TABLE \`users\` DROP COLUMN \`signature_updated_at\``,
      );
    }
  }
}
