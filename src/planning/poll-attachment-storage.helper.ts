import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

const KEY_RE =
  /^poll-attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'text/plain': 'txt',
};

const ALLOWED = new Set(Object.keys(MIME_EXT));

const MAX_BYTES = 20 * 1024 * 1024;

export class PollAttachmentStorageHelper {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(
      process.cwd(),
      config.get<string>('STORAGE_PATH') ?? 'storage',
    );
  }

  isValidKey(key: string | null | undefined): boolean {
    if (!key || typeof key !== 'string') return false;
    return KEY_RE.test(key);
  }

  extForMime(mime: string): string | null {
    return MIME_EXT[mime] ?? null;
  }

  isAllowedMime(mime: string): boolean {
    return ALLOWED.has(mime);
  }

  private abs(condominiumId: string, relativeKey: string): string {
    const safe = relativeKey.replace(/\\/g, '/');
    if (safe.includes('..') || path.isAbsolute(safe)) {
      throw new BadRequestException('Caminho inválido.');
    }
    return path.join(this.root, condominiumId, safe);
  }

  async saveFile(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    if (!this.isAllowedMime(mimeType)) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido. Use PDF, imagem, Word ou texto.',
      );
    }
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException('Arquivo muito grande (máx. 20 MB).');
    }
    const ext = this.extForMime(mimeType);
    if (!ext) {
      throw new BadRequestException('Tipo de arquivo inválido.');
    }
    const id = randomUUID();
    const relativeKey = `poll-attachments/${id}.${ext}`;
    const full = this.abs(condominiumId, relativeKey);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return relativeKey;
  }

  async readFile(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!this.isValidKey(relativeKey)) {
      throw new BadRequestException('Chave de anexo inválida.');
    }
    const ext = path.extname(relativeKey).slice(1).toLowerCase();
    const mime =
      Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ??
      'application/octet-stream';
    const full = this.abs(condominiumId, relativeKey);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(full);
    } catch {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    return {
      buffer,
      contentType: mime,
      filename: path.basename(relativeKey),
    };
  }

  async deleteFile(condominiumId: string, relativeKey: string): Promise<void> {
    if (!this.isValidKey(relativeKey)) {
      throw new BadRequestException('Chave de anexo inválida.');
    }
    const full = this.abs(condominiumId, relativeKey);
    try {
      await fs.unlink(full);
    } catch {
      /* arquivo já ausente */
    }
  }
}
