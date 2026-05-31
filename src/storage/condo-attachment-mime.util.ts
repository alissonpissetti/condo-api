/** Tipos MIME e chaves relativas para anexos fora de comprovantes/biblioteca. */

export const COMMUNICATION_ATTACHMENT_KEY_RE =
  /^communication-attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;

export const POLL_ATTACHMENT_KEY_RE =
  /^poll-attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;

export const COMMUNICATION_ATTACHMENT_MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'text/plain': 'txt',
  'audio/ogg': 'opus',
  'audio/opus': 'opus',
  'application/ogg': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export const POLL_ATTACHMENT_MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'text/plain': 'txt',
  'audio/ogg': 'opus',
  'audio/opus': 'opus',
  'application/ogg': 'opus',
};

const COMMUNICATION_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const COMMUNICATION_ALLOWED = new Set(
  Object.keys(COMMUNICATION_ATTACHMENT_MIME_EXT),
);
const POLL_ALLOWED = new Set(Object.keys(POLL_ATTACHMENT_MIME_EXT));

export const COMMUNICATION_ATTACHMENT_MAX_DEFAULT = 20 * 1024 * 1024;
export const COMMUNICATION_ATTACHMENT_MAX_VIDEO = 50 * 1024 * 1024;
export const POLL_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

export const SUPPORT_ATTACHMENT_MAX_FILES = 8;
export const SUPPORT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export const SUPPORT_ATTACHMENT_ALLOWED_MIMES = new Set([
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

export function communicationAttachmentMaxBytes(mime: string): number {
  return COMMUNICATION_VIDEO_MIMES.has(mime)
    ? COMMUNICATION_ATTACHMENT_MAX_VIDEO
    : COMMUNICATION_ATTACHMENT_MAX_DEFAULT;
}

export function isAllowedCommunicationAttachmentMime(mime: string): boolean {
  return COMMUNICATION_ALLOWED.has(mime);
}

export function isAllowedPollAttachmentMime(mime: string): boolean {
  return POLL_ALLOWED.has(mime);
}

export function contentTypeFromAttachmentKey(
  relativeKey: string,
  mimeExt: Record<string, string>,
  defaultFilename: string,
): { contentType: string; filename: string } {
  const ext = relativeKey.split('.').pop()?.toLowerCase() ?? 'bin';
  const contentType =
    ext === 'opus'
      ? 'audio/ogg'
      : Object.entries(mimeExt).find(([, e]) => e === ext)?.[0] ??
        'application/octet-stream';
  return { contentType, filename: `${defaultFilename}.${ext}` };
}

export function supportAttachmentKeyForTicket(
  ticketId: string,
  storageKey: string,
): boolean {
  const prefix = `support-tickets/${ticketId}/`;
  return (
    typeof storageKey === 'string' &&
    storageKey.startsWith(prefix) &&
    !storageKey.includes('..')
  );
}

export function safeSupportBasename(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').replace(/[^\w.\-()+ ]+/g, '_');
  const trimmed = base.slice(0, 180);
  return trimmed || 'arquivo';
}
