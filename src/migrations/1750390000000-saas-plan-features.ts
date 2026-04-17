import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona coluna `features` em `saas_plans` para ligar/desligar módulos do
 * painel por plano (Editar, Unidades, Convites, Membros, Atalhos por unidade,
 * Transações, Extrato, Fundos, Taxas condominiais, Pautas, Documentos).
 *
 * O valor é um objeto JSON no formato `{ [featureKey]: boolean }`. Quando `null`
 * ou ausente, considera-se todas as features habilitadas (retrocompatível com
 * planos criados antes desta migration).
 */
export class SaasPlanFeatures1750390000000 implements MigrationInterface {
  name = 'SaasPlanFeatures1750390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "saas_plans"
        ADD "features" json NULL
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`saas_plans\`
        ADD \`features\` json NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "saas_plans" DROP COLUMN "features"
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE \`saas_plans\` DROP COLUMN \`features\`
      `);
    }
  }
}
