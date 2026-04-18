import sanitizeHtml from 'sanitize-html';

/** Conteúdo rico permitido na descrição da pauta (sem scripts). */
export function sanitizePollBodyRich(
  input: string | undefined | null,
): string | null {
  if (input == null || !String(input).trim()) {
    return null;
  }
  const cleaned = sanitizeHtml(String(input), {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'h1',
      'h2',
      'h3',
      'img',
      'span',
      'div',
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'width', 'height'],
      a: ['href', 'name', 'target', 'rel'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  });
  return cleaned.length ? cleaned : null;
}

/**
 * Antes de remover as tags: converte quebras típicas de HTML rico em `\n`,
 * para que o PDF e outras saídas em texto simples respeitem parágrafos e `<br>`.
 */
function pollBodyHtmlToNewlinesPreservingBlocks(html: string): string {
  let s = String(html);
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(
    /<\/(?:p|div|h[1-6]|blockquote|section|article|li|tr|pre|ul|ol)>/gi,
    '\n',
  );
  return s;
}

/** Texto simples para PDF / pré-visualizações sem HTML. */
export function stripPollBodyToPlainText(html: string | null | undefined): string {
  if (html == null || !String(html).trim()) {
    return '';
  }
  const withBreaks = pollBodyHtmlToNewlinesPreservingBlocks(String(html));
  const stripped = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return stripped
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
