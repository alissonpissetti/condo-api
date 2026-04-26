import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { ReceiptStoragePort } from './receipt-storage.port';

const RECEIPT_KEY_RE =
  /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpe?g|webp)$/i;

const MANAGEMENT_LOGO_KEY_RE =
  /^management-logo\/logo\.(png|jpg|jpeg|webp)$/i;

const PLANNING_DOC_KEY_RE =
  /^documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

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

/**
 * Armazena comprovantes no Nextcloud via WebDAV.
 * Crie um usuário dedicado (ex.: condo_api) e uma senha de aplicação em Segurança.
 *
 * @see https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html
 */
@Injectable()
export class NextcloudWebdavStorageService implements ReceiptStoragePort {
  private webdavUserRoot = '';
  private basePathSegments: string[] = [];
  private authHeader = '';
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  private ensureReady(): void {
    if (this.ready) return;
    const base = this.config.get<string>('NEXTCLOUD_URL')?.replace(/\/+$/, '');
    const user = this.config.get<string>('NEXTCLOUD_USERNAME')?.trim();
    const pass =
      this.config.get<string>('NEXTCLOUD_APP_PASSWORD')?.trim() ?? '';
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
    if (!res.ok) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
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
    if (!res.ok) {
      throw new NotFoundException('Logo não encontrada.');
    }
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
    if (!res.ok) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    const fileBuffer = Buffer.from(await res.arrayBuffer());
    const contentType =
      res.headers.get('content-type') ?? 'application/pdf';
    return {
      buffer: fileBuffer,
      contentType,
      filename: relativeKey.split('/').pop() ?? 'documento.pdf',
    };
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
    const hint = looksLikeHtml
      ? ' Resposta HTML (não é WebDAV): confira NEXTCLOUD_URL (raiz da instância, ex. https://domínio sem /login), credenciais Basic e se o proxy/CDN (ex. Cloudflare) permite o método MKCOL.'
      : '';
    throw new BadRequestException(
      `Nextcloud: não foi possível criar pasta (${res.status}).${hint} ${t.slice(0, 120).replace(/\s+/g, ' ')}`,
    );
  }
}
