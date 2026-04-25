import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Express } from 'express';
import type { SupportTicketAttachmentMeta } from './support-attachment.types';

const MAX_FILES = 8;
const MAX_BYTES_PER_FILE = 25 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/opus',
  'audio/x-wav',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

@Injectable()
export class SupportAttachmentStorageService {
  constructor(private readonly config: ConfigService) {}

  private rootDir(): string {
    return path.resolve(
      process.cwd(),
      this.config.get<string>('STORAGE_PATH') ?? 'storage',
    );
  }

  isKeyForTicket(ticketId: string, storageKey: string): boolean {
    const prefix = `support-tickets/${ticketId}/`;
    return (
      typeof storageKey === 'string' &&
      storageKey.startsWith(prefix) &&
      !storageKey.includes('..')
    );
  }

  async saveMany(
    ticketId: string,
    files: Express.Multer.File[],
  ): Promise<SupportTicketAttachmentMeta[]> {
    if (!files?.length) {
      return [];
    }
    if (files.length > MAX_FILES) {
      throw new BadRequestException(
        `No máximo ${MAX_FILES} arquivos por mensagem.`,
      );
    }
    const out: SupportTicketAttachmentMeta[] = [];
    await fs.mkdir(
      path.join(this.rootDir(), 'support-ticket-attachments', ticketId),
      { recursive: true },
    );
    for (const file of files) {
      if (!file.buffer?.length) {
        throw new BadRequestException('Arquivo vazio não é permitido.');
      }
      const mime = (file.mimetype || '').toLowerCase();
      if (!ALLOWED_MIMES.has(mime)) {
        throw new BadRequestException(
          `Tipo não permitido: ${mime}. Envie PDF, imagens, MP4/WebM, áudio (MP3, WAV, OGG, OPUS) ou ZIP (máx. 25 MB cada).`,
        );
      }
      if (file.size > MAX_BYTES_PER_FILE) {
        throw new BadRequestException('Arquivo muito grande (máx. 25 MB).');
      }
      const safe = this.safeBasename(file.originalname);
      const id = randomUUID();
      const relativeKey = `support-tickets/${ticketId}/${id}_${safe}`;
      const abs = path.join(this.rootDir(), relativeKey);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, file.buffer);
      const originalFilename = file.originalname.slice(0, 255) || safe;
      await fs.writeFile(
        `${abs}.meta.json`,
        JSON.stringify({ originalFilename, mimeType: mime }),
        'utf8',
      );
      out.push({
        storageKey: relativeKey,
        originalFilename,
        mimeType: mime,
        sizeBytes: file.size,
      });
    }
    return out;
  }

  async read(
    ticketId: string,
    storageKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!this.isKeyForTicket(ticketId, storageKey)) {
      throw new BadRequestException('Chave de anexo inválida.');
    }
    const abs = path.join(this.rootDir(), storageKey);
    let filename = path.basename(storageKey);
    let contentType = 'application/octet-stream';
    try {
      const raw = await fs.readFile(`${abs}.meta.json`, 'utf8');
      const meta = JSON.parse(raw) as {
        originalFilename?: string;
        mimeType?: string;
      };
      if (meta.originalFilename) {
        filename = meta.originalFilename;
      }
      if (meta.mimeType) {
        contentType = meta.mimeType;
      }
    } catch {
      /* sem sidecar */
    }
    try {
      const buffer = await fs.readFile(abs);
      return { buffer, contentType, filename };
    } catch {
      throw new BadRequestException('Arquivo não encontrado.');
    }
  }

  private safeBasename(name: string): string {
    const base = path.basename(name).replace(/[^\w.\-()+ ]+/g, '_');
    const trimmed = base.slice(0, 180);
    return trimmed || 'arquivo';
  }
}
