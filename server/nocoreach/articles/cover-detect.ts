import {
  COVER_RATIOS,
  COVER_RATIO_TOLERANCE,
  ratioValue,
} from '../../../shared/article-publishing.js';

// Cover detection (2026-11-05): what a target's recent articles say about its covers. Each kind reads its own articles
// (nocobase-api.ts, git-files.ts); this module reads image sizes and turns what they found into settings.

/** How many recent articles a detection reads. */
export const DETECT_ARTICLES = 20;
/** The bytes of an image read for its size: its header, which every format below keeps near the start. */
export const IMAGE_HEAD_BYTES = 256 * 1024;

const IMAGE_PATH = /\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i;
/** Whether a value looks like an image address or path. */
export const looksLikeImage = (value: unknown) =>
  typeof value === 'string' && IMAGE_PATH.test(value.trim());

/** Width and height of a PNG, JPEG, GIF or WebP image from its first bytes; null for anything else. */
export function imageSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = (width: number, height: number) =>
    width > 0 && height > 0 ? { width, height } : null;
  // PNG: the IHDR chunk follows the signature.
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47)
    return size(b.readUInt32BE(16), b.readUInt32BE(20));
  // GIF: logical screen size.
  if (b.length >= 10 && b.toString('latin1', 0, 3) === 'GIF')
    return size(b.readUInt16LE(6), b.readUInt16LE(8));
  // WebP: VP8 (lossy), VP8L (lossless) or VP8X (extended).
  if (
    b.length >= 30 &&
    b.toString('latin1', 0, 4) === 'RIFF' &&
    b.toString('latin1', 8, 12) === 'WEBP'
  ) {
    const chunk = b.toString('latin1', 12, 16);
    if (chunk === 'VP8 ')
      return size(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return size((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (chunk === 'VP8X')
      return size(b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
    return null;
  }
  // JPEG: the first start-of-frame marker.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let at = 2;
    while (at + 9 < b.length) {
      if (b[at] !== 0xff) return null;
      const marker = b[at + 1];
      if (
        marker === 0xd8 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        at += 2;
        continue;
      }
      const length = b.readUInt16BE(at + 2);
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      )
        return size(b.readUInt16BE(at + 7), b.readUInt16BE(at + 5));
      at += 2 + length;
    }
  }
  return null;
}

/**
 * The ratio most covers have: the nearest offered ratio when it is within 4%, by majority; otherwise Custom, the median
 * as `N:1`. Undefined without sizes.
 */
export function commonRatio(sizes: { width: number; height: number }[]) {
  if (!sizes.length) return undefined;
  const votes = new Map<string, number>();
  const ratios = sizes.map((s) => s.width / s.height).sort((a, b) => a - b);
  for (const r of ratios) {
    const near = COVER_RATIOS.find(
      (c) => Math.abs(r / ratioValue(c)! - 1) <= COVER_RATIO_TOLERANCE,
    );
    if (near) votes.set(near, (votes.get(near) || 0) + 1);
  }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] * 2 > sizes.length) return best[0];
  const median = ratios[Math.floor(ratios.length / 2)];
  return `${Math.round(median * 100) / 100}:1`;
}

/**
 * The settings detected covers suggest: the ratio most have, at least the narrowest one's width, and required when every
 * recent article has a cover (three at least, so a new site is not held to it).
 */
export function coverSummary(input: {
  articles: number;
  covers: number;
  sizes: { width: number; height: number }[];
}) {
  const ratio = commonRatio(input.sizes);
  const minWidth = input.sizes.length
    ? Math.min(...input.sizes.map((s) => s.width))
    : undefined;
  return {
    ...(ratio ? { ratio } : {}),
    ...(minWidth ? { minWidth } : {}),
    required: input.articles >= 3 && input.covers === input.articles,
  };
}

const COVER_NAME = /cover|image|thumb|banner|hero|featured|poster|og_?image/i;
/**
 * The field to use among several: the one most recent articles fill, then a cover-like name. A field no recent article
 * fills only counts when its name says it is a cover; undefined when none does.
 */
export function pickField(counts: Map<string, number>) {
  const rank = (name: string) => {
    const at = [
      'cover',
      'image',
      'featured_image',
      'thumbnail',
      'banner',
      'hero',
    ].findIndex((n) => name.toLowerCase() === n);
    return at < 0 ? 99 : at;
  };
  return [...counts]
    .filter(([name, n]) => n > 0 || COVER_NAME.test(name))
    .sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]))
    .map(([name]) => name)[0];
}
