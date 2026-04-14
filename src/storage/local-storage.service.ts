import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ReceiptStoragePort } from './receipt-storage.port';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

@Injectable()
export class LocalStorageService implements ReceiptStoragePort {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = path.resolve(
      process.cwd(),
      this.config.get<string>('STORAGE_PATH') ?? 'storage',
    );
  }

  isValidReceiptKey(key: string | null | undefined): boolean {
    if (!key || typeof key !== 'string') return false;
    return RECEIPT_KEY_RE.test(key);
  }

  async saveTransactionReceipt(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext = MIME_EXT[mimeType];
    if (!ext) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido. Use PDF, JPG, PNG ou WEBP.',
      );
    }
    const maxBytes = 8 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new BadRequestException('Arquivo muito grande (máx. 8 MB).');
    }
    const id = randomUUID();
    const relativeKey = `receipts/${id}.${ext}`;
    const abs = this.absolutePath(condominiumId, relativeKey);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return relativeKey;
  }

  async assertReceiptExists(
    condominiumId: string,
    relativeKey: string,
  ): Promise<void> {
    if (!this.isValidReceiptKey(relativeKey)) {
      throw new BadRequestException('Chave de comprovante inválida.');
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    try {
      await fs.access(abs);
    } catch {
      throw new BadRequestException(
        'Comprovante não encontrado. Envie o arquivo novamente.',
      );
    }
  }

  async readReceipt(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!this.isValidReceiptKey(relativeKey)) {
      throw new BadRequestException('Chave inválida.');
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(abs);
    } catch {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    const ext = relativeKey.split('.').pop()?.toLowerCase() ?? 'bin';
    const contentType = EXT_MIME[ext] ?? 'application/octet-stream';
    const filename = `comprovante.${ext}`;
    return { buffer, contentType, filename };
  }

  async deleteReceipt(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void> {
    if (!relativeKey || !this.isValidReceiptKey(relativeKey)) return;
    const abs = this.absolutePath(condominiumId, relativeKey);
    try {
      await fs.unlink(abs);
    } catch {
      /* ignore */
    }
  }

  private absolutePath(condominiumId: string, relativeKey: string): string {
    const safe = relativeKey.replace(/\\/g, '/');
    if (safe.includes('..') || path.isAbsolute(safe)) {
      throw new BadRequestException('Caminho inválido.');
    }
    return path.join(this.root, condominiumId, safe);
  }
}
