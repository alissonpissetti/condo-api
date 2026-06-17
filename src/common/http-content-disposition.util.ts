/**
 * Monta Content-Disposition seguro para nomes com acentos, espaços ou caracteres especiais.
 * Evita ERR_INVALID_CHAR em headers HTTP (Node rejeita \\r, \\n e chars de controle).
 */
export function buildContentDispositionHeader(
  disposition: 'attachment' | 'inline',
  filename: string,
): string {
  const cleaned = sanitizeDownloadFilename(filename);
  const asciiFallback =
    cleaned
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_')
      .trim() || 'download';
  const encoded = encodeURIComponent(cleaned).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export function sanitizeDownloadFilename(filename: string): string {
  return (filename ?? '')
    .replace(/[\r\n\x00-\x1f\x7f]/g, '')
    .replace(/"/g, "'")
    .trim()
    .slice(0, 255);
}
