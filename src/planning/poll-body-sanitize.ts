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

/**
 * Extrai o texto de uma secção `<h3>…</h3>` do HTML da ata (ex.: Discussões e deliberações).
 */
export function extractHtmlSectionByHeading(
  html: string | null | undefined,
  headingPattern: RegExp,
): string | null {
  if (html == null || !String(html).trim()) {
    return null;
  }
  const chunks = String(html).split(/<h3\b[^>]*>/i);
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const close = chunk.search(/<\/h3>/i);
    if (close < 0) {
      continue;
    }
    const title = chunk
      .slice(0, close)
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!headingPattern.test(title)) {
      continue;
    }
    const body = chunk.slice(close + 5);
    const nextH3 = body.search(/<h3\b/i);
    const sectionHtml = nextH3 >= 0 ? body.slice(0, nextH3) : body;
    const plain = stripPollBodyToPlainText(sectionHtml);
    return plain.trim() ? plain : null;
  }
  return null;
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
