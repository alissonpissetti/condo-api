import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

const DOC_KEY_RE =
  /^documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

export class DocumentStorageHelper {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(
      process.cwd(),
      config.get<string>('STORAGE_PATH') ?? 'storage',
    );
  }

  isValidKey(key: string | null | undefined): boolean {
    if (!key || typeof key !== 'string') return false;
    return DOC_KEY_RE.test(key);
  }

  private abs(condominiumId: string, relativeKey: string): string {
    const safe = relativeKey.replace(/\\/g, '/');
    if (safe.includes('..') || path.isAbsolute(safe)) {
      throw new BadRequestException('Caminho inválido.');
    }
    return path.join(this.root, condominiumId, safe);
  }

  async savePdf(condominiumId: string, buffer: Buffer): Promise<string> {
    const maxBytes = 12 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new BadRequestException('PDF muito grande (máx. 12 MB).');
    }
    const id = randomUUID();
    const relativeKey = `documents/${id}.pdf`;
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
      throw new BadRequestException('Chave de documento inválida.');
    }
    const full = this.abs(condominiumId, relativeKey);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(full);
    } catch {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    return {
      buffer,
      contentType: 'application/pdf',
      filename: path.basename(relativeKey),
    };
  }
}
