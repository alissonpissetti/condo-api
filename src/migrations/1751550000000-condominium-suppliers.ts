import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CondominiumSuppliers1751550000000 implements MigrationInterface {
  name = 'CondominiumSuppliers1751550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_suppliers" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "name" varchar(255) NOT NULL,
  "phone" varchar(32) NULL,
  "pix_key" varchar(255) NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_suppliers" PRIMARY KEY ("id"),
  CONSTRAINT "FK_condominium_suppliers_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_condominium_suppliers_condo_name"
ON "condominium_suppliers" ("condominium_id", "name")
`);
      await queryRunner.query(`
ALTER TABLE "condominium_work_budgets"
ADD COLUMN "supplier_id" varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE "condominium_work_budgets"
ADD CONSTRAINT "FK_condominium_work_budgets_supplier"
FOREIGN KEY ("supplier_id") REFERENCES "condominium_suppliers"("id")
ON DELETE SET NULL ON UPDATE CASCADE
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`condominium_suppliers\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`phone\` varchar(32) NULL,
  \`pix_key\` varchar(255) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_condominium_suppliers_condo\` (\`condominium_id\`),
  CONSTRAINT \`FK_condominium_suppliers_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_condominium_suppliers_condo_name\`
ON \`condominium_suppliers\` (\`condominium_id\`, \`name\`)
`);
      await queryRunner.query(`
ALTER TABLE \`condominium_work_budgets\`
ADD COLUMN \`supplier_id\` varchar(36) NULL,
ADD KEY \`IDX_condominium_work_budgets_supplier\` (\`supplier_id\`),
ADD CONSTRAINT \`FK_condominium_work_budgets_supplier\`
FOREIGN KEY (\`supplier_id\`) REFERENCES \`condominium_suppliers\`(\`id\`)
ON DELETE SET NULL ON UPDATE CASCADE
`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_work_budgets"
DROP CONSTRAINT "FK_condominium_work_budgets_supplier"
`);
      await queryRunner.query(`
ALTER TABLE "condominium_work_budgets" DROP COLUMN "supplier_id"
`);
      await queryRunner.query(`DROP INDEX "IDX_condominium_suppliers_condo_name"`);
      await queryRunner.query(`DROP TABLE "condominium_suppliers"`);
    } else {
      await queryRunner.query(`
ALTER TABLE \`condominium_work_budgets\`
DROP FOREIGN KEY \`FK_condominium_work_budgets_supplier\`,
DROP INDEX \`IDX_condominium_work_budgets_supplier\`,
DROP COLUMN \`supplier_id\`
`);
      await queryRunner.query(`
DROP INDEX \`IDX_condominium_suppliers_condo_name\` ON \`condominium_suppliers\`
`);
      await queryRunner.query(`DROP TABLE \`condominium_suppliers\``);
    }
  }
}
