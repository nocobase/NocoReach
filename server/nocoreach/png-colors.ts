import { inflateSync } from 'node:zlib';
import { countedColors, setColors } from '../../shared/card-colors.js';

/**
 * What NocoReach reads of a card image an Agent uploads (2026-11-16, Content workshop PR 2): its size from the PNG
 * header, and the colors it is drawn in, counted from its pixels rather than taken from the Agent. A color is one that
 * covers at least 0.5% of the image; near shades count as one, and so does a blend of two of its colors (text drawn
 * with opacity, anti-aliased edges), as a person counting a card's colors would. Only 8-bit, non-interlaced PNGs are decoded; any other PNG keeps its size and has no colors counted.
 */

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type PngInfo = { width: number; height: number; colors?: string[] };

/** The PNG's size, or null when the bytes are not a PNG. */
export function pngSize(
  bytes: Buffer,
): { width: number; height: number } | null {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(SIGNATURE)) return null;
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function pngInfo(bytes: Buffer): PngInfo | null {
  const size = pngSize(bytes);
  if (!size) return null;
  try {
    const colors = pngColors(bytes, size.width, size.height);
    return colors ? { ...size, colors } : size;
  } catch {
    return size;
  }
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function pngColors(
  bytes: Buffer,
  width: number,
  height: number,
): string[] | null {
  const depth = bytes[24],
    type = bytes[25],
    interlace = bytes[28];
  const channels = CHANNELS[type];
  if (
    depth !== 8 ||
    interlace !== 0 ||
    !channels ||
    width * height > 40_000_000
  )
    return null;
  const parts: Buffer[] = [];
  let plte: Buffer | null = null;
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = bytes.readUInt32BE(at),
      kind = bytes.toString('latin1', at + 4, at + 8);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (kind === 'IDAT') parts.push(data);
    else if (kind === 'PLTE') plte = data;
    else if (kind === 'IEND') break;
    at += 12 + length;
  }
  if (type === 3 && !plte) return null;
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) return null;
  const counts = new Map<number, number>();
  let previous = Buffer.alloc(stride),
    line = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)],
      row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels] : 0,
        up = previous[x],
        corner = x >= channels ? previous[x - channels] : 0;
      let v = row[x];
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner,
          pa = Math.abs(p - left),
          pb = Math.abs(p - up),
          pc = Math.abs(p - corner);
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      line[x] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const i = x * channels;
      let rgb: number;
      if (type === 3) {
        const p = line[i] * 3;
        rgb = (plte![p] << 16) | (plte![p + 1] << 8) | plte![p + 2];
      } else if (type === 0 || type === 4) rgb = line[i] * 0x10101;
      else rgb = (line[i] << 16) | (line[i + 1] << 8) | line[i + 2];
      counts.set(rgb, (counts.get(rgb) || 0) + 1);
    }
    [previous, line] = [line, previous];
  }
  return countedColors(counts, width * height);
}

// The counting rule is shared with the browser, which counts a card drawn on a canvas the same way.
export { setColors };
