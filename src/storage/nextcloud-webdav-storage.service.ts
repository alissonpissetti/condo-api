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
 * Crie um utilizador dedicado (ex.: condo_api) e uma palavra-passe de aplicação em Segurança.
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
        'Nextcloud: defina NEXTCLOUD_APP_PASSWORD (palavra-passe de aplicação).',
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
      headers: {
        Authorization: this.authHeader,
        'Content-Type': mimeType,
      },
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
      headers: { Authorization: this.authHeader },
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
      headers: { Authorization: this.authHeader },
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
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok && res.status !== 404) {
      /*404 = já removido */
    }
  }

  /** URL do ficheiro (sem criar pastas). */
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

  private async mkcol(url: string): Promise<void> {
    const res = await fetch(url, {
      method: 'MKCOL',
      headers: { Authorization: this.authHeader },
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
    throw new BadRequestException(
      `Nextcloud: não foi possível criar pasta (${res.status}). ${t.slice(0, 160)}`,
    );
  }
}
