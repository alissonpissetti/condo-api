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
import type { Express } from 'express';
import type {
  ReceiptStoragePort,
  SupportAttachmentMeta,
} from './receipt-storage.port';
import {
  COMMUNICATION_ATTACHMENT_KEY_RE,
  COMMUNICATION_ATTACHMENT_MIME_EXT,
  POLL_ATTACHMENT_KEY_RE,
  POLL_ATTACHMENT_MIME_EXT,
  POLL_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_FILES,
  SUPPORT_ATTACHMENT_ALLOWED_MIMES,
  communicationAttachmentMaxBytes as communicationMaxBytesForMime,
  contentTypeFromAttachmentKey,
  isAllowedCommunicationAttachmentMime as isCommunicationMimeAllowed,
  isAllowedPollAttachmentMime as isPollMimeAllowed,
  safeSupportBasename,
  supportAttachmentKeyForTicket,
} from './condo-attachment-mime.util';
import {
  feeSlipRelativeKey,
  isValidFeeSlipKey as isValidFeeSlipStorageKey,
} from './fee-slip-storage.util';
import {
  assertWorkAttachmentSize,
  resolveWorkDocumentExtension,
  workDocumentContentTypeFromKey,
} from './work-document-storage.util';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

const MANAGEMENT_LOGO_KEY_RE =
  /^management-logo\/logo\.(png|jpg|jpeg|webp)$/i;

const PLANNING_DOC_KEY_RE =
  /^documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

const LIBRARY_DOC_KEY_RE =
  /^library-documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;

const WORK_DOC_KEY_RE =
  /^works\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;

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

  isValidFeeSlipKey(key: string | null | undefined): boolean {
    return isValidFeeSlipStorageKey(key);
  }

  async saveFeeSlipPdf(
    condominiumId: string,
    competenceYm: string,
    unitId: string,
    buffer: Buffer,
  ): Promise<string> {
    const maxBytes = 15 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new BadRequestException('PDF slip muito grande (máx. 15 MB).');
    }
    const relativeKey = feeSlipRelativeKey(competenceYm, unitId);
    const abs = this.absolutePath(condominiumId, relativeKey);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return relativeKey;
  }

  async resolveFeeSlipPublicUrl(
    _condominiumId: string,
    _relativeKey: string,
  ): Promise<string | null> {
    return null;
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

  isValidWorkDocumentKey(key: string | null | undefined): boolean {
    return typeof key === 'string' && WORK_DOC_KEY_RE.test(key);
  }

  async saveWorkDocument(
    condominiumId: string,
    workId: string,
    buffer: Buffer,
    mimeType: string,
    originalFilename?: string,
  ): Promise<string> {
    assertWorkAttachmentSize(buffer);
    const ext = resolveWorkDocumentExtension(mimeType, originalFilename);
    const id = randomUUID();
    const relativeKey = `works/${workId}/${id}.${ext}`;
    const abs = this.absolutePath(condominiumId, relativeKey);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return relativeKey;
  }

  async readWorkDocument(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!this.isValidWorkDocumentKey(relativeKey)) {
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
      contentType: workDocumentContentTypeFromKey(relativeKey),
      filename: path.basename(relativeKey),
    };
  }

  async deleteWorkDocument(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void> {
    if (!relativeKey || !this.isValidWorkDocumentKey(relativeKey)) {
      return;
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    try {
      await fs.unlink(abs);
    } catch {
      /* ignore */
    }
  }

  isValidCommunicationAttachmentKey(key: string | null | undefined): boolean {
    return typeof key === 'string' && COMMUNICATION_ATTACHMENT_KEY_RE.test(key);
  }

  isAllowedCommunicationAttachmentMime(mime: string): boolean {
    return isCommunicationMimeAllowed(mime);
  }

  communicationAttachmentMaxBytes(mime: string): number {
    return communicationMaxBytesForMime(mime);
  }

  async saveCommunicationAttachment(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    if (!isCommunicationMimeAllowed(mimeType)) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido. Use PDF, imagem, Word, texto, áudio ou vídeo (MP4, WebM, MOV).',
      );
    }
    const max = communicationMaxBytesForMime(mimeType);
    if (buffer.length > max) {
      throw new BadRequestException(
        `Arquivo muito grande (máx. ${Math.round(max / (1024 * 1024))} MB).`,
      );
    }
    const ext = COMMUNICATION_ATTACHMENT_MIME_EXT[mimeType];
    if (!ext) {
      throw new BadRequestException('Tipo de arquivo inválido.');
    }
    const relativeKey = `communication-attachments/${randomUUID()}.${ext}`;
    const abs = this.absolutePath(condominiumId, relativeKey);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return relativeKey;
  }

  async readCommunicationAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!this.isValidCommunicationAttachmentKey(relativeKey)) {
      throw new BadRequestException('Chave de anexo inválida.');
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(abs);
    } catch {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    const meta = contentTypeFromAttachmentKey(
      relativeKey,
      COMMUNICATION_ATTACHMENT_MIME_EXT,
      'anexo',
    );
    return { buffer, ...meta };
  }

  async deleteCommunicationAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<void> {
    if (!this.isValidCommunicationAttachmentKey(relativeKey)) {
      return;
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    try {
      await fs.unlink(abs);
    } catch {
      /* ignore */
    }
  }

  isValidPollAttachmentKey(key: string | null | undefined): boolean {
    return typeof key === 'string' && POLL_ATTACHMENT_KEY_RE.test(key);
  }

  isAllowedPollAttachmentMime(mime: string): boolean {
    return isPollMimeAllowed(mime);
  }

  async savePollAttachment(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    if (!isPollMimeAllowed(mimeType)) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido. Use PDF, imagem, Word, texto ou áudio (ex.: .opus).',
      );
    }
    if (buffer.length > POLL_ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('Arquivo muito grande (máx. 20 MB).');
    }
    const ext = POLL_ATTACHMENT_MIME_EXT[mimeType];
    if (!ext) {
      throw new BadRequestException('Tipo de arquivo inválido.');
    }
    const relativeKey = `poll-attachments/${randomUUID()}.${ext}`;
    const abs = this.absolutePath(condominiumId, relativeKey);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return relativeKey;
  }

  async readPollAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!this.isValidPollAttachmentKey(relativeKey)) {
      throw new BadRequestException('Chave de anexo inválida.');
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(abs);
    } catch {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    const meta = contentTypeFromAttachmentKey(
      relativeKey,
      POLL_ATTACHMENT_MIME_EXT,
      path.basename(relativeKey).replace(/\.[^.]+$/, '') || 'anexo',
    );
    return { buffer, contentType: meta.contentType, filename: relativeKey.split('/').pop() ?? meta.filename };
  }

  async deletePollAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<void> {
    if (!this.isValidPollAttachmentKey(relativeKey)) {
      throw new BadRequestException('Chave de anexo inválida.');
    }
    const abs = this.absolutePath(condominiumId, relativeKey);
    try {
      await fs.unlink(abs);
    } catch {
      /* ignore */
    }
  }

  isSupportAttachmentKeyForTicket(
    ticketId: string,
    storageKey: string,
  ): boolean {
    return supportAttachmentKeyForTicket(ticketId, storageKey);
  }

  async saveSupportAttachments(
    ticketId: string,
    files: Express.Multer.File[],
  ): Promise<SupportAttachmentMeta[]> {
    if (!files?.length) {
      return [];
    }
    if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
      throw new BadRequestException(
        `No máximo ${SUPPORT_ATTACHMENT_MAX_FILES} arquivos por mensagem.`,
      );
    }
    const out: SupportAttachmentMeta[] = [];
    await fs.mkdir(
      path.join(this.root, 'support-ticket-attachments', ticketId),
      { recursive: true },
    );
    for (const file of files) {
      if (!file.buffer?.length) {
        throw new BadRequestException('Arquivo vazio não é permitido.');
      }
      const mime = (file.mimetype || '').toLowerCase();
      if (!SUPPORT_ATTACHMENT_ALLOWED_MIMES.has(mime)) {
        throw new BadRequestException(
          `Tipo não permitido: ${mime}. Envie PDF, imagens, MP4/WebM, áudio (MP3, WAV, OGG, OPUS) ou ZIP (máx. 25 MB cada).`,
        );
      }
      if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
        throw new BadRequestException('Arquivo muito grande (máx. 25 MB).');
      }
      const safe = safeSupportBasename(file.originalname);
      const id = randomUUID();
      const relativeKey = `support-tickets/${ticketId}/${id}_${safe}`;
      const abs = this.absoluteGlobalPath(relativeKey);
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

  async readSupportAttachment(
    ticketId: string,
    storageKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!this.isSupportAttachmentKeyForTicket(ticketId, storageKey)) {
      throw new BadRequestException('Chave de anexo inválida.');
    }
    const abs = this.absoluteGlobalPath(storageKey);
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
      throw new NotFoundException('Arquivo não encontrado.');
    }
  }

  private absolutePath(condominiumId: string, relativeKey: string): string {
    const safe = relativeKey.replace(/\\/g, '/');
    if (safe.includes('..') || path.isAbsolute(safe)) {
      throw new BadRequestException('Caminho inválido.');
    }
    return path.join(this.root, condominiumId, safe);
  }

  private absoluteGlobalPath(relativeKey: string): string {
    const safe = relativeKey.replace(/\\/g, '/');
    if (safe.includes('..') || path.isAbsolute(safe)) {
      throw new BadRequestException('Caminho inválido.');
    }
    return path.join(this.root, safe);
  }
}
