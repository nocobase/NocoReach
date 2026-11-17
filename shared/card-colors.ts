/**
 * The colors a card is drawn in, counted from its pixels as a person counting a card's colors would (2026-11-16,
 * Content workshop PR 2): a color covers at least 0.5% of the image, near shades count as one, and so does a blend of two
 * of its colors (text drawn with opacity, anti-aliased edges). The server counts an uploaded PNG's pixels
 * (server/nocoreach/png-colors.ts); the browser counts a card drawn on a canvas the same way, when a style is made with
 * AI (client/pages/workshop/card-style-maker.tsx).
 */

const SHARE = 0.005;
const NEAR = 16;
const BLEND = 20;

const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
const rgbOf = (v: number) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
const distance = (a: number, b: number) => {
  const [x, y] = [rgbOf(a), rgbOf(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
/** How far a color is from the blends of two others (the segment between them). */
function blendDistance(c: number, a: number, b: number) {
  const [p, x, y] = [rgbOf(c), rgbOf(a), rgbOf(b)];
  const d = [y[0] - x[0], y[1] - x[1], y[2] - x[2]];
  const len = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
  const t = len
    ? Math.max(
        0,
        Math.min(
          1,
          ((p[0] - x[0]) * d[0] + (p[1] - x[1]) * d[1] + (p[2] - x[2]) * d[2]) /
            len,
        ),
      )
    : 0;
  return Math.hypot(
    p[0] - x[0] - t * d[0],
    p[1] - x[1] - t * d[1],
    p[2] - x[2] - t * d[2],
  );
}

/**
 * The colors among candidates (most used first) as a person would name them: shades within NEAR of an earlier one are
 * that one, and a color lying between two others is their blend (text drawn with opacity, anti-aliased edges, a tint
 * of the brand color), not a color of its own.
 */
function palette(candidates: readonly number[]): number[] {
  const kept: number[] = [];
  for (const c of candidates)
    if (!kept.some((k) => distance(k, c) < NEAR)) kept.push(c);
  return kept.filter(
    (c) =>
      !kept.some((a, i) =>
        kept.some(
          (b, j) =>
            j > i && a !== c && b !== c && blendDistance(c, a, b) < BLEND,
        ),
      ),
  );
}

/** The colors of pixels counted by their 0xRRGGBB value, out of `total` pixels. */
export function countedColors(
  counts: ReadonlyMap<number, number>,
  total: number,
): string[] {
  const min = total * SHARE;
  return palette(
    [...counts]
      .filter(([, count]) => count >= min)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([rgb]) => rgb),
  ).map(hex);
}

/** The colors of an image's RGBA pixels (a canvas's `ImageData.data`), transparency ignored. */
export function pixelColors(rgba: ArrayLike<number>): string[] {
  const counts = new Map<number, number>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const rgb = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts.set(rgb, (counts.get(rgb) || 0) + 1);
  }
  return countedColors(counts, rgba.length / 4);
}

/** The colors of a set of cards: every card's colors together, a shade or blend of another counted with it. */
export function setColors(lists: readonly (readonly string[])[]): string[] {
  return palette(lists.flat().map((h) => parseInt(h.slice(1), 16))).map(hex);
}
