import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
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

/**
 * Armazena comprovantes no Nextcloud via WebDAV.
 * Crie um usuário dedicado (ex.: condo_api) e uma senha de aplicação em Segurança.
 *
 * @see https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html
 */
@Injectable()
export class NextcloudWebdavStorageService
  implements ReceiptStoragePort, OnModuleInit
{
  private readonly logger = new Logger(NextcloudWebdavStorageService.name);
  private webdavUserRoot = '';
  private basePathSegments: string[] = [];
  private authHeader = '';
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    void this.verifyWebdavAuthAtStartup();
  }

  private static stripEnvSecret(value: string | undefined): string {
    return (value ?? '').trim().replace(/^['"]|['"]$/g, '');
  }

  private async verifyWebdavAuthAtStartup(): Promise<void> {
    const base = this.config.get<string>('NEXTCLOUD_URL')?.trim();
    const user = this.config.get<string>('NEXTCLOUD_USERNAME')?.trim();
    const pass = NextcloudWebdavStorageService.stripEnvSecret(
      this.config.get<string>('NEXTCLOUD_APP_PASSWORD'),
    );
    if (!base || !user || !pass) {
      return;
    }
    try {
      this.ensureReady();
      const res = await fetch(this.webdavUserRoot, {
        method: 'PROPFIND',
        headers: { ...this.webdavFetchHeaders(), Depth: '0' },
      });
      if (res.status === 401 || res.status === 403) {
        this.logger.error(
          'Nextcloud WebDAV: autenticação recusada (401/403). Confira NEXTCLOUD_USERNAME e NEXTCLOUD_APP_PASSWORD — use senha de aplicação (Segurança → Senhas de aplicação), não a senha de login do painel.',
        );
      } else if (!res.ok && res.status !== 404) {
        this.logger.warn(
          `Nextcloud WebDAV: PROPFIND respondeu HTTP ${res.status}. Verifique NEXTCLOUD_URL (raiz da instância, sem /login).`,
        );
      } else {
        this.logger.log('Nextcloud WebDAV: autenticação verificada com sucesso.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Nextcloud WebDAV: falha ao verificar conexão — ${msg}`);
    }
  }

  private ensureReady(): void {
    if (this.ready) return;
    const base = this.config.get<string>('NEXTCLOUD_URL')?.replace(/\/+$/, '');
    const user = this.config.get<string>('NEXTCLOUD_USERNAME')?.trim();
    const pass = NextcloudWebdavStorageService.stripEnvSecret(
      this.config.get<string>('NEXTCLOUD_APP_PASSWORD'),
    );
    if (!base || !user) {
      throw new BadRequestException(
        'Nextcloud: defina NEXTCLOUD_URL e NEXTCLOUD_USERNAME.',
      );
    }
    if (!pass) {
      throw new BadRequestException(
        'Nextcloud: defina NEXTCLOUD_APP_PASSWORD (senha de aplicação).',
      );
    }
    this.webdavUserRoot = `${base}/remote.php/dav/files/${encodeURIComponent(user)}`;
    const prefix =
      this.config
        .get<string>('NEXTCLOUD_RECEIPTS_PATH')
        ?.replace(/^\/+|\/+$/g, '') ?? 'condo-receipts';
    this.basePathSegments = prefix.split('/').filter(Boolean);
    this.authHeader =
      'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
    this.ready = true;
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
    this.ensureReady();
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
    const url = this.objectUrl(condominiumId, relativeKey);
    await this.ensureHierarchy(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.webdavFetchHeaders(), 'Content-Type': mimeType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new BadRequestException(
        `Falha ao enviar comprovante ao Nextcloud (${res.status}). ${t.slice(0, 200)}`,
      );
    }
    return relativeKey;
  }

  async assertReceiptExists(
    condominiumId: string,
    relativeKey: string,
  ): Promise<void> {
    this.ensureReady();
    if (!this.isValidReceiptKey(relativeKey)) {
      throw new BadRequestException('Chave de comprovante inválida.');
    }
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'HEAD',
      headers: this.webdavFetchHeaders(),
    });
    if (res.status !== 200) {
      throw new BadRequestException(
        'Comprovante não encontrado no armazenamento. Envie o arquivo novamente.',
      );
    }
  }

  async readReceipt(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    this.ensureReady();
    if (!this.isValidReceiptKey(relativeKey)) {
      throw new BadRequestException('Chave inválida.');
    }
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      headers: this.webdavFetchHeaders(),
    });
    this.assertWebdavGetOk(
      res,
      condominiumId,
      relativeKey,
      'Comprovante não encontrado no Nextcloud. Se o registro veio de outro ambiente ou o upload foi com outro tipo de armazenamento, reenvie o arquivo.',
    );
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = relativeKey.split('.').pop()?.toLowerCase() ?? 'bin';
    const contentType =
      res.headers.get('content-type') ??
      EXT_MIME[ext] ??
      'application/octet-stream';
    const filename = `comprovante.${ext}`;
    return { buffer, contentType, filename };
  }

  async deleteReceipt(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void> {
    if (!relativeKey || !this.isValidReceiptKey(relativeKey)) return;
    this.ensureReady();
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.webdavFetchHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      /*404 = já removido */
    }
  }

  async saveManagementLogo(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    this.ensureReady();
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
    for (const oldExt of ['png', 'jpg', 'jpeg', 'webp']) {
      const oldKey = `management-logo/logo.${oldExt}`;
      await this.deleteManagementLogo(condominiumId, oldKey);
    }
    const relativeKey = `management-logo/logo.${ext}`;
    const url = this.objectUrl(condominiumId, relativeKey);
    await this.ensureHierarchy(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.webdavFetchHeaders(), 'Content-Type': mimeType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new BadRequestException(
        `Falha ao enviar logo ao Nextcloud (${res.status}). ${t.slice(0, 200)}`,
      );
    }
    return relativeKey;
  }

  async readManagementLogo(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    this.ensureReady();
    if (!this.isValidManagementLogoKey(relativeKey)) {
      throw new BadRequestException('Chave de logo inválida.');
    }
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      headers: this.webdavFetchHeaders(),
    });
    this.assertWebdavGetOk(
      res,
      condominiumId,
      relativeKey,
      'Logo não encontrada no armazenamento. Envie a imagem de novo em Dados do condomínio.',
    );
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = relativeKey.split('.').pop()?.toLowerCase() ?? 'png';
    const contentType =
      res.headers.get('content-type') ??
      EXT_MIME[ext] ??
      'application/octet-stream';
    return { buffer, contentType };
  }

  async deleteManagementLogo(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void> {
    if (!relativeKey || !this.isValidManagementLogoKey(relativeKey)) {
      return;
    }
    this.ensureReady();
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.webdavFetchHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      /* ignore */
    }
  }

  async savePlanningDocumentPdf(
    condominiumId: string,
    buffer: Buffer,
  ): Promise<string> {
    this.ensureReady();
    const maxBytes = 12 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new BadRequestException('PDF muito grande (máx. 12 MB).');
    }
    const id = randomUUID();
    const relativeKey = `documents/${id}.pdf`;
    const url = this.objectUrl(condominiumId, relativeKey);
    await this.ensureHierarchy(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.webdavFetchHeaders(), 'Content-Type': 'application/pdf' },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new BadRequestException(
        `Falha ao enviar documento ao Nextcloud (${res.status}). ${t.slice(0, 200)}`,
      );
    }
    return relativeKey;
  }

  async readPlanningDocument(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    this.ensureReady();
    if (!this.isValidPlanningDocumentKey(relativeKey)) {
      throw new BadRequestException('Chave de documento inválida.');
    }
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      headers: this.webdavFetchHeaders(),
    });
    this.assertWebdavGetOk(
      res,
      condominiumId,
      relativeKey,
      'PDF de ata/documento não encontrado no Nextcloud. Gere novamente a partir da pauta ou verifique o armazenamento.',
    );
    const fileBuffer = Buffer.from(await res.arrayBuffer());
    const contentType =
      res.headers.get('content-type') ?? 'application/pdf';
    return {
      buffer: fileBuffer,
      contentType,
      filename: relativeKey.split('/').pop() ?? 'documento.pdf',
    };
  }

  async saveLibraryDocument(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    this.ensureReady();
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
    const url = this.objectUrl(condominiumId, relativeKey);
    await this.ensureHierarchy(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.webdavFetchHeaders(), 'Content-Type': mimeType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new BadRequestException(
        `Falha ao enviar documento ao Nextcloud (${res.status}). ${t.slice(0, 200)}`,
      );
    }
    return relativeKey;
  }

  async readLibraryDocument(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    this.ensureReady();
    if (!this.isValidLibraryDocumentKey(relativeKey)) {
      throw new BadRequestException('Chave de documento inválida.');
    }
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      headers: this.webdavFetchHeaders(),
    });
    this.assertWebdavGetOk(
      res,
      condominiumId,
      relativeKey,
      'Arquivo não encontrado no Nextcloud. Causas comuns: registro vindo de outro ambiente sem os arquivos; upload com STORAGE_DRIVER=local (arquivo no disco) e a API de produção usando nextcloud; ou arquivo removido no Nextcloud. Reenvie o documento na biblioteca ou alinhe os arquivos com a mesma chave (storage) e pasta do condomínio no usuário da API.',
    );
    const fileBuffer = Buffer.from(await res.arrayBuffer());
    const ext = relativeKey.split('.').pop()?.toLowerCase() ?? 'bin';
    const contentType =
      res.headers.get('content-type') ??
      EXT_MIME[ext] ??
      Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ??
      'application/octet-stream';
    return {
      buffer: fileBuffer,
      contentType,
      filename: relativeKey.split('/').pop() ?? 'documento',
    };
  }

  async deleteLibraryDocument(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void> {
    if (!relativeKey || !this.isValidLibraryDocumentKey(relativeKey)) {
      return;
    }
    this.ensureReady();
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.webdavFetchHeaders(),
    });
    if (!res.ok && res.status !== 404) {
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
    this.ensureReady();
    assertWorkAttachmentSize(buffer);
    const ext = resolveWorkDocumentExtension(mimeType, originalFilename);
    const id = randomUUID();
    const relativeKey = `works/${workId}/${id}.${ext}`;
    const url = this.objectUrl(condominiumId, relativeKey);
    await this.ensureHierarchy(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.webdavFetchHeaders(), 'Content-Type': mimeType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new BadRequestException(
        `Falha ao enviar documento ao Nextcloud (${res.status}). ${t.slice(0, 200)}`,
      );
    }
    return relativeKey;
  }

  async readWorkDocument(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    this.ensureReady();
    if (!this.isValidWorkDocumentKey(relativeKey)) {
      throw new BadRequestException('Chave de documento inválida.');
    }
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      headers: this.webdavFetchHeaders(),
    });
    this.assertWebdavGetOk(
      res,
      condominiumId,
      relativeKey,
      'Arquivo não encontrado no Nextcloud.',
    );
    const fileBuffer = Buffer.from(await res.arrayBuffer());
    const contentType =
      res.headers.get('content-type') ??
      workDocumentContentTypeFromKey(relativeKey);
    return {
      buffer: fileBuffer,
      contentType,
      filename: relativeKey.split('/').pop() ?? 'documento',
    };
  }

  async deleteWorkDocument(
    condominiumId: string,
    relativeKey: string | null | undefined,
  ): Promise<void> {
    if (!relativeKey || !this.isValidWorkDocumentKey(relativeKey)) {
      return;
    }
    this.ensureReady();
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.webdavFetchHeaders(),
    });
    if (!res.ok && res.status !== 404) {
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
    return this.putCondominiumObject(
      condominiumId,
      buffer,
      mimeType,
      () => {
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
        return `communication-attachments/${randomUUID()}.${ext}`;
      },
      'Falha ao enviar anexo ao armazenamento',
    );
  }

  async readCommunicationAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    return this.readCondominiumObject(
      condominiumId,
      relativeKey,
      () => this.isValidCommunicationAttachmentKey(relativeKey),
      'Chave de anexo inválida.',
      'Anexo não encontrado no armazenamento. Reenvie o arquivo ou verifique STORAGE_DRIVER e credenciais do Nextcloud.',
      COMMUNICATION_ATTACHMENT_MIME_EXT,
      'anexo',
    );
  }

  async deleteCommunicationAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<void> {
    await this.deleteCondominiumObject(
      condominiumId,
      relativeKey,
      () => this.isValidCommunicationAttachmentKey(relativeKey),
    );
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
    return this.putCondominiumObject(
      condominiumId,
      buffer,
      mimeType,
      () => {
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
        return `poll-attachments/${randomUUID()}.${ext}`;
      },
      'Falha ao enviar anexo da pauta ao armazenamento',
    );
  }

  async readPollAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const read = await this.readCondominiumObject(
      condominiumId,
      relativeKey,
      () => this.isValidPollAttachmentKey(relativeKey),
      'Chave de anexo inválida.',
      'Anexo da pauta não encontrado no armazenamento. Reenvie o arquivo.',
      POLL_ATTACHMENT_MIME_EXT,
      'anexo',
    );
    return {
      ...read,
      filename: relativeKey.split('/').pop() ?? read.filename,
    };
  }

  async deletePollAttachment(
    condominiumId: string,
    relativeKey: string,
  ): Promise<void> {
    await this.deleteCondominiumObject(
      condominiumId,
      relativeKey,
      () => this.isValidPollAttachmentKey(relativeKey),
    );
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
    this.ensureReady();
    if (!files?.length) {
      return [];
    }
    if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
      throw new BadRequestException(
        `No máximo ${SUPPORT_ATTACHMENT_MAX_FILES} arquivos por mensagem.`,
      );
    }
    const out: SupportAttachmentMeta[] = [];
    for (const file of files) {
      if (!file.buffer?.length) {
        throw new BadRequestException('Arquivo vazio não é permitido.');
      }
      const mime = (file.mimetype || '').toLowerCase();
      if (!SUPPORT_ATTACHMENT_ALLOWED_MIMES.has(mime)) {
        throw new BadRequestException(
          `Tipo não permitido: ${mime}. Envie PDF, imagens, MP4/WebM, áudio ou ZIP (máx. 25 MB cada).`,
        );
      }
      if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
        throw new BadRequestException('Arquivo muito grande (máx. 25 MB).');
      }
      const safe = safeSupportBasename(file.originalname);
      const relativeKey = `support-tickets/${ticketId}/${randomUUID()}_${safe}`;
      await this.ensureGlobalHierarchy(relativeKey);
      const url = this.globalObjectUrl(relativeKey);
      const res = await fetch(url, {
        method: 'PUT',
        headers: { ...this.webdavFetchHeaders(), 'Content-Type': mime },
        body: new Uint8Array(file.buffer),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new BadRequestException(
          `Falha ao enviar anexo de suporte (${res.status}). ${t.slice(0, 200)}`,
        );
      }
      const originalFilename = file.originalname.slice(0, 255) || safe;
      const metaKey = `${relativeKey}.meta.json`;
      await this.ensureGlobalHierarchy(metaKey);
      const metaUrl = this.globalObjectUrl(metaKey);
      await fetch(metaUrl, {
        method: 'PUT',
        headers: {
          ...this.webdavFetchHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ originalFilename, mimeType: mime }),
      });
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
    this.ensureReady();
    if (!this.isSupportAttachmentKeyForTicket(ticketId, storageKey)) {
      throw new BadRequestException('Chave de anexo inválida.');
    }
    let filename = storageKey.split('/').pop() ?? 'arquivo';
    let contentType = 'application/octet-stream';
    const metaUrl = this.globalObjectUrl(`${storageKey}.meta.json`);
    const metaRes = await fetch(metaUrl, {
      headers: this.webdavFetchHeaders(),
    });
    if (metaRes.ok) {
      try {
        const meta = (await metaRes.json()) as {
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
        /* ignore */
      }
    }
    const url = this.globalObjectUrl(storageKey);
    const res = await fetch(url, { headers: this.webdavFetchHeaders() });
    this.assertWebdavGetOk(
      res,
      '_global',
      storageKey,
      'Arquivo de suporte não encontrado no armazenamento.',
    );
    const buffer = Buffer.from(await res.arrayBuffer());
    if (contentType === 'application/octet-stream') {
      contentType =
        res.headers.get('content-type') ?? contentType;
    }
    return { buffer, contentType, filename };
  }

  private async putCondominiumObject(
    condominiumId: string,
    buffer: Buffer,
    mimeType: string,
    buildKey: () => string,
    failLabel: string,
  ): Promise<string> {
    this.ensureReady();
    const relativeKey = buildKey();
    const url = this.objectUrl(condominiumId, relativeKey);
    await this.ensureHierarchy(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.webdavFetchHeaders(), 'Content-Type': mimeType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new BadRequestException(
        `${failLabel} (${res.status}). ${t.slice(0, 200)}`,
      );
    }
    return relativeKey;
  }

  private async readCondominiumObject(
    condominiumId: string,
    relativeKey: string,
    isValid: () => boolean,
    invalidKeyMessage: string,
    notFoundMessage: string,
    mimeExt: Record<string, string>,
    defaultName: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    this.ensureReady();
    if (!isValid()) {
      throw new BadRequestException(invalidKeyMessage);
    }
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, { headers: this.webdavFetchHeaders() });
    this.assertWebdavGetOk(res, condominiumId, relativeKey, notFoundMessage);
    const buffer = Buffer.from(await res.arrayBuffer());
    const meta = contentTypeFromAttachmentKey(
      relativeKey,
      mimeExt,
      defaultName,
    );
    const contentType =
      res.headers.get('content-type') ?? meta.contentType;
    return { buffer, contentType, filename: meta.filename };
  }

  private async deleteCondominiumObject(
    condominiumId: string,
    relativeKey: string,
    isValid: () => boolean,
  ): Promise<void> {
    if (!isValid()) {
      return;
    }
    this.ensureReady();
    const url = this.objectUrl(condominiumId, relativeKey);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.webdavFetchHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      /* ignore */
    }
  }

  private globalObjectUrl(relativeKey: string): string {
    const segments = [
      ...this.basePathSegments,
      ...relativeKey.split('/').filter(Boolean),
    ];
    const encoded = segments.map((s) => encodeURIComponent(s)).join('/');
    return `${this.webdavUserRoot}/${encoded}`;
  }

  private async ensureGlobalHierarchy(relativeKey: string): Promise<void> {
    const parts = relativeKey.split('/').filter(Boolean).slice(0, -1);
    for (let i = 0; i < parts.length; i++) {
      const segs = [...this.basePathSegments, ...parts.slice(0, i + 1)];
      const url = `${this.webdavUserRoot}/${segs.map((s) => encodeURIComponent(s)).join('/')}`;
      await this.mkcol(url);
    }
  }

  /**
   * Trata resposta GET no WebDAV: 401/403 não são "ficheiro inexistente" (evita confundir com 404).
   */
  private assertWebdavGetOk(
    res: Response,
    condominiumId: string,
    relativeKey: string,
    notFoundMessage: string,
  ): void {
    if (res.ok) {
      return;
    }
    this.logger.warn(
      `WebDAV GET ${relativeKey} condo=${condominiumId} -> HTTP ${res.status}`,
    );
    if (res.status === 401 || res.status === 403) {
      throw new ServiceUnavailableException(
        'O armazenamento (Nextcloud) recusou o acesso da API. Verifique NEXTCLOUD_URL, NEXTCLOUD_USERNAME e NEXTCLOUD_APP_PASSWORD (senha de aplicação) no servidor da API.',
      );
    }
    if (res.status === 404) {
      throw new NotFoundException(notFoundMessage);
    }
    throw new BadRequestException(
      `Falha ao ler arquivo no armazenamento (HTTP ${res.status}).`,
    );
  }

  /** URL do arquivo (sem criar pastas). */
  private objectUrl(condominiumId: string, relativeKey: string): string {
    const segments = [
      ...this.basePathSegments,
      condominiumId,
      ...relativeKey.split('/').filter(Boolean),
    ];
    const path = segments.map((s) => encodeURIComponent(s)).join('/');
    return `${this.webdavUserRoot}/${path}`;
  }

  /**
   * Cria pastas: …/condo-receipts, …/condo-receipts/{condoId}, …/receipts/ se necessário.
   */
  private async ensureHierarchy(
    condominiumId: string,
    relativeKey: string,
  ): Promise<void> {
    const dirs: string[][] = [];
    dirs.push([...this.basePathSegments]);
    dirs.push([...this.basePathSegments, condominiumId]);
    const extra = relativeKey.split('/').filter(Boolean).slice(0, -1);
    for (let i = 0; i < extra.length; i++) {
      dirs.push([
        ...this.basePathSegments,
        condominiumId,
        ...extra.slice(0, i + 1),
      ]);
    }
    for (const segs of dirs) {
      const url = `${this.webdavUserRoot}/${segs.map((s) => encodeURIComponent(s)).join('/')}`;
      await this.mkcol(url);
    }
  }

  private webdavFetchHeaders(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      /** Alguns proxies exigem User-Agent explícito para não devolver página HTML genérica. */
      'User-Agent': 'CondoAPI-NextcloudWebDAV/1',
    };
  }

  private async mkcol(url: string): Promise<void> {
    const res = await fetch(url, {
      method: 'MKCOL',
      headers: this.webdavFetchHeaders(),
    });
    if (
      res.ok ||
      res.status === 405 ||
      res.status === 301 ||
      res.status === 302 ||
      res.status === 409
    ) {
      return;
    }
    const t = await res.text().catch(() => '');
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    const looksLikeHtml =
      ct.includes('text/html') || /^\s*<!DOCTYPE/i.test(t);
    if (res.status === 401 || res.status === 403) {
      throw new ServiceUnavailableException(
        'Nextcloud recusou o login (401). Verifique NEXTCLOUD_URL, NEXTCLOUD_USERNAME e NEXTCLOUD_APP_PASSWORD. ' +
          'A senha deve ser uma senha de aplicação criada em Segurança → Senhas de aplicação (não use a senha normal de acesso). ' +
          'O utilizador tem de existir no Nextcloud e ter permissão de escrita em Ficheiros. ' +
          'Se o armazenamento for S3 (storage-api) e não Nextcloud WebDAV, remova NEXTCLOUD_* e configure STORAGE_API_* no .env.',
      );
    }
    const hint = looksLikeHtml
      ? ' Resposta HTML (não é WebDAV): confira NEXTCLOUD_URL (raiz da instância, ex. https://domínio sem /login) e se o proxy permite MKCOL.'
      : '';
    throw new BadRequestException(
      `Nextcloud: não foi possível criar pasta (${res.status}).${hint} ${t.slice(0, 120).replace(/\s+/g, ' ')}`,
    );
  }
}
