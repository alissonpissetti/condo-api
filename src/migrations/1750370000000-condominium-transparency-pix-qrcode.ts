import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumTransparencyPixQrcode1750370000000
  implements MigrationInterface
{
  name = 'CondominiumTransparencyPixQrcode1750370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominiums"
  ADD COLUMN "transparency_pdf_include_pix_qrcode" boolean NOT NULL DEFAULT true
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\`
  ADD COLUMN \`transparency_pdf_include_pix_qrcode\` tinyint(1) NOT NULL DEFAULT 1
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominiums"
  DROP COLUMN "transparency_pdf_include_pix_qrcode"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\`
  DROP COLUMN \`transparency_pdf_include_pix_qrcode\`
`);
    }
  }
}
