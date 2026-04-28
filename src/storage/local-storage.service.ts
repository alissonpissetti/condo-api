import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ReceiptStoragePort } from './receipt-storage.port';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

const MANAGEMENT_LOGO_KEY_RE =
  /^management-logo\/logo\.(png|jpg|jpeg|webp)$/i;

const PLANNING_DOC_KEY_RE =
  /^documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

const LIBRARY_DOC_KEY_RE =
  /^library-documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

@Injectable()
export class LocalStorageService
  implements ReceiptStoragePort, OnModuleInit
{
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = path.resolve(
      process.cwd(),
      this.config.get<string>('STORAGE_PATH') ?? 'storage',
    );
  }

  /**
   * Falha cedo (com mensagem legível) se o diretório de storage não puder ser criado,
   * em vez de só no primeiro upload — típico em contentores a correr sem root.
   */
  async onModuleInit(): Promise<void> {
    try {
      await fs.mkdir(this.root, { recursive: true });
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      this.logger.error(
        `Não é possível criar ou aceder a STORAGE_PATH (${this.root}): ${
          err?.message ?? String(e)
        }. ` +
          `Com STORAGE_DRIVER=local, o processo precisa de permissão de escrita. ` +
          `Em imagem Docker: crie a pasta no Dockerfile (antes de USER node) com ` +
          `chown para o utilizador do processo, ou defina STORAGE_PATH num volume montado ` +
          `gravável (ex. /data/storage) e crie com o mesmo dono. ` +
          `Em alternativa: STORAGE_DRIVER=nextcloud (WebDAV).`,
      );
      throw e;
    }
  }

  isValidReceiptKey(key: string | null | undefined): boolean {
    if (!key || typeof key !== 'string') return false;
    return RECEIPT_KEY_RE.test(key);
  }

  isValidManagementLogoKey(key: string | null | undefined): boolean {
    if (!key || typeof key !== 'string') return false;
    return MANAGEMENT_LOGO_KEY_RE.test(key);
  }

  isValidPlanningDocumentKey(key: string | null | undefined): boolean {
    if (!key || typeof key !== 'string') return false;
    return PLANNING_DOC_KEY_RE.test(key);
  }

  isValidLibraryDocumentKey(key: string | null | undefined): boolean {
    if (!key || typeof key !== 'string') return false;
    return LIBRARY_DOC_KEY_RE.test(key);
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

  async saveManagementLogo(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext = MIME_EXT[mimeType];
    if (!ext || ext === 'pdf') {
      throw new BadRequestException(
        'Logo: use imagem PNG, JPG ou WEBP.',
      );
    }
    const maxBytes = 2 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new BadRequestException('Logo muito grande (máx. 2 MB).');
    }
    const logoDirAbs = path.join(
      this.root,
      condominiumId,
      'management-logo',
    );
    await fs.mkdir(logoDirAbs, { recursive: true });
    try {
      const existing = await fs.readdir(logoDirAbs);
      for (const f of existing) {
        await fs.unlink(path.join(logoDirAbs, f)).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
    const relativeKey = `management-logo/logo.${ext}`;
    const abs = this.absolutePath(condominiumId, relativeKey);
    await fs.writeFile(abs, buffer);
    return relativeKey;
  }

  async readManagementLogo(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!this.isValidManagementLogoKey(relativeKey)) {
      throw new BadRequestException('Chave de logo inválida.');
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(abs);
    } catch {
      throw new NotFoundException('Logo não encontrada.');
    }
    const ext = relativeKey.split('.').pop()?.toLowerCase() ?? 'png';
    const contentType = EXT_MIME[ext] ?? 'application/octet-stream';
    return { buffer, contentType };
  }

  async deleteManagementLogo(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void> {
    if (!relativeKey || !this.isValidManagementLogoKey(relativeKey)) {
      return;
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    try {
      await fs.unlink(abs);
    } catch {
      /* ignore */
    }
  }

  async savePlanningDocumentPdf(
    condominiumId: string,
    buffer: Buffer,
  ): Promise<string> {
    const maxBytes = 12 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new BadRequestException('PDF muito grande (máx. 12 MB).');
    }
    const id = randomUUID();
    const relativeKey = `documents/${id}.pdf`;
    const abs = this.absolutePath(condominiumId, relativeKey);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return relativeKey;
  }

  async readPlanningDocument(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!this.isValidPlanningDocumentKey(relativeKey)) {
      throw new BadRequestException('Chave de documento inválida.');
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(abs);
    } catch {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    return {
      buffer: fileBuffer,
      contentType: 'application/pdf',
      filename: path.basename(relativeKey),
    };
  }

  async saveLibraryDocument(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext = MIME_EXT[mimeType];
    if (!ext) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido. Use PDF, imagem, Word, TXT ou CSV.',
      );
    }
    const maxBytes = 20 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new BadRequestException('Arquivo muito grande (máx. 20 MB).');
    }
    const id = randomUUID();
    const relativeKey = `library-documents/${id}.${ext}`;
    const abs = this.absolutePath(condominiumId, relativeKey);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return relativeKey;
  }

  async readLibraryDocument(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!this.isValidLibraryDocumentKey(relativeKey)) {
      throw new BadRequestException('Chave de documento inválida.');
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(abs);
    } catch {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    const ext = path.extname(relativeKey).slice(1).toLowerCase();
    const contentType =
      EXT_MIME[ext] ??
      Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ??
      'application/octet-stream';
    return {
      buffer: fileBuffer,
      contentType,
      filename: path.basename(relativeKey),
    };
  }

  async deleteLibraryDocument(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void> {
    if (!relativeKey || !this.isValidLibraryDocumentKey(relativeKey)) {
      return;
    }
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
