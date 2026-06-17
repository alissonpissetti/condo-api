import { BadRequestException } from '@nestjs/common';

/** Limite por anexo na timeline de obras (vídeos/áudio). */
export const WORK_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024;

const SAFE_EXT_RE = /^[a-z0-9]{1,8}$/;

/** MIME → extensão (sem ponto). */
export const WORK_MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/x-7z-compressed': '7z',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/mpeg': 'mpeg',
  'video/ogg': 'ogv',
  'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/webm': 'weba',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/x-m4a': 'm4a',
  'audio/vnd.wave': 'wav',
};

/** Extensão → MIME (download). */
export const WORK_EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  ogv: 'video/ogg',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  weba: 'audio/webm',
  wav: 'audio/wav',
  aac: 'audio/aac',
  flac: 'audio/flac',
  bin: 'application/octet-stream',
};

export function extensionFromFilename(
  originalFilename?: string | null,
): string | null {
  const name = (originalFilename ?? '').trim();
  if (!name) return null;
  const base = name.replace(/^.*[/\\]/, '');
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  if (!SAFE_EXT_RE.test(ext)) return null;
  return ext;
}

export function resolveWorkDocumentExtension(
  mimeType: string,
  originalFilename?: string,
): string {
  const fromName = extensionFromFilename(originalFilename);
  if (fromName) {
    return fromName;
  }

  const mime = (mimeType || 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (WORK_MIME_TO_EXT[mime]) {
    return WORK_MIME_TO_EXT[mime];
  }

  if (mime.startsWith('image/')) {
    const sub = mime.slice(6);
    if (sub === 'jpeg') return 'jpg';
    return sub.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'img';
  }
  if (mime.startsWith('video/')) {
    if (mime.includes('quicktime')) return 'mov';
    const sub = mime.slice(6).replace(/^x-/, '');
    return sub.slice(0, 8) || 'mp4';
  }
  if (mime.startsWith('audio/')) {
    const sub = mime.slice(6).replace(/^x-/, '');
    return sub.slice(0, 8) || 'mp3';
  }

  return 'bin';
}

export function workDocumentContentTypeFromKey(relativeKey: string): string {
  const ext = relativeKey.split('.').pop()?.toLowerCase() ?? '';
  return WORK_EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

export function assertWorkAttachmentSize(buffer: Buffer): void {
  if (buffer.length > WORK_ATTACHMENT_MAX_BYTES) {
    throw new BadRequestException(
      `Arquivo muito grande (máx. ${Math.round(WORK_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB).`,
    );
  }
}
