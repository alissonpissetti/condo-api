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

/** Texto simples para PDF / pré-visualizações sem HTML. */
export function stripPollBodyToPlainText(html: string | null | undefined): string {
  if (html == null || !String(html).trim()) {
    return '';
  }
  return sanitizeHtml(String(html), {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}
