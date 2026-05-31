import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { WorkDocumentStoragePort } from './work-document-storage.port';
import {
  assertWorkAttachmentSize,
  resolveWorkDocumentExtension,
  workDocumentContentTypeFromKey,
} from './work-document-storage.util';

const WORK_DOC_KEY_RE =
  /^works\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;

/**
 * Anexos de comentários / timeline de obras no storage-api (S3 compatível).
 * Chave no bucket: `{prefix}/{condominiumId}/{relativeKey}`.
 */
@Injectable()
export class StorageApiWorkDocumentService
  implements WorkDocumentStoragePort, OnModuleInit
{
  private readonly logger = new Logger(StorageApiWorkDocumentService.name);
  private client: S3Client | null = null;
  private bucket = '';
  private prefixSegments: string[] = [];
  private configured = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const endpoint = this.config.get<string>('STORAGE_API_ENDPOINT')?.trim();
    const accessKeyId = this.config
      .get<string>('STORAGE_API_ACCESS_KEY_ID')
      ?.trim();
    const secretAccessKey = this.config
      .get<string>('STORAGE_API_SECRET_ACCESS_KEY')
      ?.trim();
    const bucket = this.config.get<string>('STORAGE_API_BUCKET')?.trim();
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      return;
    }
    const region =
      this.config.get<string>('STORAGE_API_REGION')?.trim() || 'sa-east-1';
    this.client = new S3Client({
      region,
      endpoint: endpoint.replace(/\/+$/, ''),
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    this.bucket = bucket;
    const prefix =
      this.config
        .get<string>('STORAGE_API_PREFIX')
        ?.replace(/^\/+|\/+$/g, '') ??
      this.config
        .get<string>('NEXTCLOUD_RECEIPTS_PATH')
        ?.replace(/^\/+|\/+$/g, '') ??
      'condo-receipts';
    this.prefixSegments = prefix.split('/').filter(Boolean);
    this.configured = true;
    this.logger.log(
      `Anexos de obras → storage-api (${endpoint}, bucket=${bucket}, prefix=${prefix || '(raiz)'})`,
    );
  }

  /** Indica se STORAGE_API_* está completo (usado pelo módulo para escolher o provider). */
  isEnabled(): boolean {
    return this.configured && this.client !== null;
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
    const objectKey = this.objectKey(condominiumId, relativeKey);
    try {
      await this.client!.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: mimeType || 'application/octet-stream',
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `Falha ao enviar anexo da obra ao storage-api. ${msg.slice(0, 200)}`,
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
    const objectKey = this.objectKey(condominiumId, relativeKey);
    let res;
    try {
      res = await this.client!.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
    } catch (err: unknown) {
      const name =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name: string }).name)
          : '';
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new NotFoundException('Arquivo não encontrado no storage-api.');
      }
      throw new BadRequestException(
        'Falha ao ler anexo da obra no storage-api.',
      );
    }
    if (!res.Body) {
      throw new NotFoundException('Arquivo não encontrado no storage-api.');
    }
    const fileBuffer = Buffer.from(await res.Body.transformToByteArray());
    const contentType =
      res.ContentType ?? workDocumentContentTypeFromKey(relativeKey);
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
    if (!this.isEnabled()) {
      return;
    }
    const objectKey = this.objectKey(condominiumId, relativeKey);
    try {
      await this.client!.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
    } catch {
      /* ignore */
    }
  }

  private ensureReady(): void {
    if (!this.isEnabled()) {
      throw new BadRequestException(
        'storage-api: defina STORAGE_API_ENDPOINT, STORAGE_API_ACCESS_KEY_ID, STORAGE_API_SECRET_ACCESS_KEY e STORAGE_API_BUCKET.',
      );
    }
  }

  private objectKey(condominiumId: string, relativeKey: string): string {
    const segments = [
      ...this.prefixSegments,
      condominiumId,
      ...relativeKey.split('/').filter(Boolean),
    ];
    return segments.join('/');
  }
}
