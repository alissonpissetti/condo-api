import type { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

export class CondominiumWorkTimelineAttachments1751470000000
  implements MigrationInterface
{
  name = 'CondominiumWorkTimelineAttachments1751470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(`
CREATE TABLE "condominium_work_timeline_attachments" (
  "id" varchar(36) NOT NULL,
  "entry_id" varchar(36) NOT NULL,
  "storage_key" varchar(512) NOT NULL,
  "original_filename" varchar(255) NOT NULL,
  "mime_type" varchar(128) NOT NULL,
  "size_bytes" int NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_cwta" PRIMARY KEY ("id"),
  CONSTRAINT "FK_cwta_entry" FOREIGN KEY ("entry_id")
    REFERENCES "condominium_work_timeline_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`);
      await queryRunner.query(`
CREATE INDEX "IDX_cwta_entry" ON "condominium_work_timeline_attachments" ("entry_id")
`);
    } else {
      await queryRunner.query(`
CREATE TABLE \`condominium_work_timeline_attachments\` (
  \`id\` varchar(36) NOT NULL,
  \`entry_id\` varchar(36) NOT NULL,
  \`storage_key\` varchar(512) NOT NULL,
  \`original_filename\` varchar(255) NOT NULL,
  \`mime_type\` varchar(128) NOT NULL,
  \`size_bytes\` int NOT NULL,
  \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`IDX_cwta_entry\` (\`entry_id\`),
  CONSTRAINT \`FK_cwta_entry\` FOREIGN KEY (\`entry_id\`)
    REFERENCES \`condominium_work_timeline_entries\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
    }

    const budgetTableExists = await queryRunner.hasTable(
      'condominium_work_budget_attachments',
    );
    if (budgetTableExists) {
      const budgetRows = (await queryRunner.query(
        `SELECT a.id, a.budget_id, a.storage_key, a.original_filename, a.mime_type, a.size_bytes, a.created_at
         FROM ${dialect === 'postgres' ? '"condominium_work_budget_attachments"' : '`condominium_work_budget_attachments`'} a`,
      )) as Array<{
        id: string;
        budget_id: string;
        storage_key: string;
        original_filename: string;
        mime_type: string;
        size_bytes: number;
        created_at: Date;
      }>;

      for (const row of budgetRows) {
        const entries = (await queryRunner.query(
          `SELECT id FROM ${dialect === 'postgres' ? '"condominium_work_timeline_entries"' : '`condominium_work_timeline_entries`'}
           WHERE budget_id = '${row.budget_id}' AND kind = 'budget' LIMIT 1`,
        )) as Array<{ id: string }>;
        const entryId = entries[0]?.id;
        if (!entryId) continue;
        await this.insertAttachment(queryRunner, dialect, {
          id: row.id,
          entryId,
          storageKey: row.storage_key,
          originalFilename: row.original_filename,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          createdAt: row.created_at,
        });
      }

      if (dialect === 'postgres') {
        await queryRunner.query(
          `DROP TABLE IF EXISTS "condominium_work_budget_attachments"`,
        );
      } else {
        await queryRunner.query(
          `DROP TABLE IF EXISTS \`condominium_work_budget_attachments\``,
        );
      }
    }

    const docRows = (await queryRunner.query(
      `SELECT id, storage_key, original_filename, mime_type, size_bytes, created_at
       FROM ${dialect === 'postgres' ? '"condominium_work_timeline_entries"' : '`condominium_work_timeline_entries`'}
       WHERE kind = 'document' AND storage_key IS NOT NULL`,
    )) as Array<{
      id: string;
      storage_key: string;
      original_filename: string | null;
      mime_type: string | null;
      size_bytes: number | null;
      created_at: Date;
    }>;

    for (const row of docRows) {
      await this.insertAttachment(queryRunner, dialect, {
        id: randomUUID(),
        entryId: row.id,
        storageKey: row.storage_key,
        originalFilename: row.original_filename ?? 'documento',
        mimeType: row.mime_type ?? 'application/octet-stream',
        sizeBytes: row.size_bytes ?? 0,
        createdAt: row.created_at,
      });
    }
  }

  private async insertAttachment(
    queryRunner: QueryRunner,
    dialect: string,
    row: {
      id: string;
      entryId: string;
      storageKey: string;
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
      createdAt: Date;
    },
  ): Promise<void> {
    const table =
      dialect === 'postgres'
        ? '"condominium_work_timeline_attachments"'
        : '`condominium_work_timeline_attachments`';
    const created =
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt);
    if (dialect === 'postgres') {
      await queryRunner.query(
        `INSERT INTO ${table}
          (id, entry_id, storage_key, original_filename, mime_type, size_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          row.id,
          row.entryId,
          row.storageKey,
          row.originalFilename,
          row.mimeType,
          row.sizeBytes,
          created,
        ],
      );
      return;
    }
    await queryRunner.query(
      `INSERT IGNORE INTO ${table}
        (id, entry_id, storage_key, original_filename, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.entryId,
        row.storageKey,
        row.originalFilename,
        row.mimeType,
        row.sizeBytes,
        created,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    if (dialect === 'postgres') {
      await queryRunner.query(
        `DROP TABLE IF EXISTS "condominium_work_timeline_attachments"`,
      );
      return;
    }
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`condominium_work_timeline_attachments\``,
    );
  }
}
