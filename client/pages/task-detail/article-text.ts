// Plain helpers for the article preview and the Agent's notes (article-preview.tsx, agent-notes.tsx).

/**
 * An address in the article the browser may open or load: an http(s) address, or a relative one read against the
 * article's page on its site. Anything else (no page to read it against, another scheme) is left out.
 */
export function siteUrl(src: string | undefined, pageUrl?: string): string {
  if (!src?.trim()) return '';
  try {
    const url = /^[a-z][a-z0-9+.-]*:/i.test(src)
      ? new URL(src)
      : pageUrl
        ? new URL(src, pageUrl)
        : null;
    return url && ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

/** A notes text's first paragraph as plain text, for results from before the Agent wrote a summary. */
export function leadOf(notes: string): string {
  const block = notes
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .find((b) => b && !/^(#{1,6}\s|```|\||>|-{3,}$)/.test(b));
  if (!block) return '';
  const plain = block
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/^\s*(?:[-+]|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 240 ? `${plain.slice(0, 240)}…` : plain;
}
