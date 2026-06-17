import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  DEFAULT_SUPPLIER_CATEGORIES,
  SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID,
} from '../condominium-works/supplier-category.constants';

export class SupplierCategories1751560000000 implements MigrationInterface {
  name = 'SupplierCategories1751560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_supplier_categories" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "name" varchar(255) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_condominium_supplier_categories" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_supplier_category_scope_name" UNIQUE ("condominium_id", "name")
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_supplier_categories_scope"
ON "condominium_supplier_categories" ("condominium_id")
`);
      for (const row of DEFAULT_SUPPLIER_CATEGORIES) {
        await queryRunner.query(
          `
INSERT INTO "condominium_supplier_categories" ("id", "condominium_id", "name")
VALUES ($1, $2, $3)
ON CONFLICT ("id") DO NOTHING
`,
          [row.id, SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID, row.name],
        );
      }
      await queryRunner.query(`
ALTER TABLE "condominium_suppliers"
ADD COLUMN "category_id" varchar(36) NULL
`);
      await queryRunner.query(`
ALTER TABLE "condominium_suppliers"
ADD CONSTRAINT "FK_condominium_suppliers_category"
FOREIGN KEY ("category_id") REFERENCES "condominium_supplier_categories"("id")
ON DELETE SET NULL ON UPDATE CASCADE
`);
      return;
    }

    await queryRunner.query(`
CREATE TABLE \`condominium_supplier_categories\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`UQ_supplier_category_scope_name\` (\`condominium_id\`, \`name\`),
  KEY \`IDX_supplier_categories_scope\` (\`condominium_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    for (const row of DEFAULT_SUPPLIER_CATEGORIES) {
      await queryRunner.query(
        `
INSERT IGNORE INTO \`condominium_supplier_categories\` (\`id\`, \`condominium_id\`, \`name\`)
VALUES (?, ?, ?)
`,
        [row.id, SUPPLIER_CATEGORY_GLOBAL_SCOPE_ID, row.name],
      );
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_suppliers\`
ADD COLUMN \`category_id\` varchar(36) NULL,
ADD KEY \`IDX_condominium_suppliers_category\` (\`category_id\`),
ADD CONSTRAINT \`FK_condominium_suppliers_category\`
FOREIGN KEY (\`category_id\`) REFERENCES \`condominium_supplier_categories\`(\`id\`)
ON DELETE SET NULL ON UPDATE CASCADE
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
ALTER TABLE "condominium_suppliers"
DROP CONSTRAINT "FK_condominium_suppliers_category"
`);
      await queryRunner.query(`
ALTER TABLE "condominium_suppliers" DROP COLUMN "category_id"
`);
      await queryRunner.query(`DROP TABLE "condominium_supplier_categories"`);
      return;
    }
    await queryRunner.query(`
ALTER TABLE \`condominium_suppliers\`
DROP FOREIGN KEY \`FK_condominium_suppliers_category\`,
DROP INDEX \`IDX_condominium_suppliers_category\`,
DROP COLUMN \`category_id\`
`);
    await queryRunner.query(`DROP TABLE \`condominium_supplier_categories\``);
  }
}
