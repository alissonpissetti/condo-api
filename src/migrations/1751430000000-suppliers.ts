import type { MigrationInterface, QueryRunner } from 'typeorm';

const SEED_NAMES = [
  'Manutenção e conservação',
  'Limpeza e zeladoria',
  'Segurança e portaria',
  'Água, gás e energia',
  'Elétrica e automação',
  'Administrativo e contábil',
  'Obras e reformas',
  'Paisagismo',
  'Elevadores e equipamentos',
  'Outros',
];

export class Suppliers1751430000000 implements MigrationInterface {
  name = 'Suppliers1751430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "supplier_categories" (
  "id" varchar(36) NOT NULL,
  "name" varchar(128) NOT NULL,
  "created_by_user_id" varchar(36) NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_supplier_categories" PRIMARY KEY ("id"),
  CONSTRAINT "FK_supplier_cat_user" FOREIGN KEY ("created_by_user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_supplier_cat_creator" ON "supplier_categories" ("created_by_user_id")
`);
      await queryRunner.query(`
CREATE TABLE "suppliers" (
  "id" varchar(36) NOT NULL,
  "condominium_id" varchar(36) NOT NULL,
  "category_id" varchar(36) NOT NULL,
  "name" varchar(255) NOT NULL,
  "legal_name" varchar(255) NULL,
  "document_cnpj_cpf" varchar(18) NULL,
  "pix_key_type" varchar(16) NULL,
  "pix_key_value" varchar(255) NULL,
  "phone" varchar(32) NULL,
  "email" varchar(255) NULL,
  "notes" text NULL,
  "address_line" varchar(500) NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_suppliers" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_suppliers_pix_pair" CHECK (
    ("pix_key_type" IS NULL AND "pix_key_value" IS NULL) OR
    ("pix_key_type" IS NOT NULL AND "pix_key_value" IS NOT NULL)
  ),
  CONSTRAINT "FK_suppliers_condo" FOREIGN KEY ("condominium_id")
    REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FK_suppliers_category" FOREIGN KEY ("category_id")
    REFERENCES "supplier_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_suppliers_condo" ON "suppliers" ("condominium_id")
`);
      await queryRunner.query(`
CREATE INDEX "IDX_suppliers_category" ON "suppliers" ("category_id")
`);
      for (const name of SEED_NAMES) {
        await queryRunner.query(
          `INSERT INTO "supplier_categories" ("id", "name", "created_by_user_id", "created_at")
           VALUES (gen_random_uuid(), $1, NULL, now())`,
          [name],
        );
      }
    } else {
      await queryRunner.query(`
CREATE TABLE \`supplier_categories\` (
  \`id\` varchar(36) NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`created_by_user_id\` varchar(36) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`FK_supplier_cat_user\` FOREIGN KEY (\`created_by_user_id\`)
    REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_supplier_cat_creator\` ON \`supplier_categories\` (\`created_by_user_id\`)
`);
      await queryRunner.query(`
CREATE TABLE \`suppliers\` (
  \`id\` varchar(36) NOT NULL,
  \`condominium_id\` varchar(36) NOT NULL,
  \`category_id\` varchar(36) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`legal_name\` varchar(255) NULL,
  \`document_cnpj_cpf\` varchar(18) NULL,
  \`pix_key_type\` varchar(16) NULL,
  \`pix_key_value\` varchar(255) NULL,
  \`phone\` varchar(32) NULL,
  \`email\` varchar(255) NULL,
  \`notes\` text NULL,
  \`address_line\` varchar(500) NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`CHK_suppliers_pix_pair\` CHECK (
    (\`pix_key_type\` IS NULL AND \`pix_key_value\` IS NULL) OR
    (\`pix_key_type\` IS NOT NULL AND \`pix_key_value\` IS NOT NULL)
  ),
  CONSTRAINT \`FK_suppliers_condo\` FOREIGN KEY (\`condominium_id\`)
    REFERENCES \`condominiums\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`FK_suppliers_category\` FOREIGN KEY (\`category_id\`)
    REFERENCES \`supplier_categories\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_suppliers_condo\` ON \`suppliers\` (\`condominium_id\`)
`);
      await queryRunner.query(`
CREATE INDEX \`IDX_suppliers_category\` ON \`suppliers\` (\`category_id\`)
`);
      for (const name of SEED_NAMES) {
        const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "''");
        await queryRunner.query(`
INSERT INTO \`supplier_categories\` (\`id\`, \`name\`, \`created_by_user_id\`, \`created_at\`)
VALUES (UUID(), '${escaped}', NULL, CURRENT_TIMESTAMP(6))
`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`DROP TABLE "suppliers"`);
      await queryRunner.query(`DROP TABLE "supplier_categories"`);
    } else {
      await queryRunner.query(`DROP TABLE \`suppliers\``);
      await queryRunner.query(`DROP TABLE \`supplier_categories\``);
    }
  }
}
