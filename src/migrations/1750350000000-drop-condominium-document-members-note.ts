import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Reverte coluna de «nomes só para documento» ao nível do condomínio. */
export class DropCondominiumDocumentMembersNote1750350000000
  implements MigrationInterface
{
  name = 'DropCondominiumDocumentMembersNote1750350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominiums" DROP COLUMN IF EXISTS "document_members_note"
`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominiums\` DROP COLUMN IF EXISTS \`document_members_note\`
`);
    }
  }

  public async down(): Promise<void> {
    /* irreversível por opção de produto */
  }
}
