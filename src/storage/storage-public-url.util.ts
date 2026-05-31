import type { ConfigService } from '@nestjs/config';

/** Junta segmentos com encode por parte (S3 / nginx alias). */
export function encodeStoragePathSegments(segments: string[]): string {
  return segments
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');
}

/**
 * URL pública S3/MinIO (path-style). Não usar com Nextcloud — lá o ficheiro não está na raiz do site.
 * Requer STORAGE_PUBLIC_BASE_URL ou STORAGE_API_ENDPOINT.
 */
export function buildStoragePublicObjectUrl(
  config: ConfigService,
  objectKey: string,
): string | null {
  const base = (
    config.get<string>('STORAGE_PUBLIC_BASE_URL')?.trim() ||
    config.get<string>('STORAGE_API_ENDPOINT')?.trim()
  )?.replace(/\/+$/, '');
  if (!base || !objectKey) {
    return null;
  }
  const path = encodeStoragePathSegments(objectKey.split('/'));
  const bucket = config.get<string>('STORAGE_API_BUCKET')?.trim();
  const includeBucket =
    bucket &&
    config.get<string>('STORAGE_PUBLIC_INCLUDE_BUCKET') !== 'false' &&
    config.get<string>('STORAGE_API_ENDPOINT')?.trim();
  if (includeBucket) {
    return `${base}/${encodeURIComponent(bucket)}/${path}`;
  }
  return `${base}/${path}`;
}
