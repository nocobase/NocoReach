// @vitest-environment node
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { imagesPdf, rgbOf, type PdfPage } from '../../client/lib/pdf.js';

// A LinkedIn carousel's PDF (2026-11-24): the done card builds it in the browser from the card images, one image per
// page at 96 dpi, with no library.

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

async function page(width: number, height: number): Promise<PdfPage> {
  const rgba = new Uint8Array(width * height * 4).fill(200);
  const stream = new Blob([rgbOf(rgba) as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return {
    width,
    height,
    filter: 'FlateDecode',
    data: new Uint8Array(await new Response(stream).arrayBuffer()),
  };
}

describe('Carousel PDF', () => {
  it('drops alpha from the pixels', () => {
    expect([...rgbOf(new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]))]).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('puts one image per page at 96 dpi, with a cross-reference table that finds every object', async () => {
    const pdf = imagesPdf(
      [await page(1080, 1350), await page(1080, 1350)],
      '小团队怎么选项目管理工具',
    );
    const text = latin1(pdf);
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Pages /Kids [4 0 R 7 0 R] /Count 2');
    expect(text).toContain('/MediaBox [0 0 810 1012.5]');
    expect(text).toContain('/Width 1080 /Height 1350');
    // A title outside ASCII is written as UTF-16BE with a byte order mark.
    expect(text).toContain('/Title <FEFF5C0F56E2961F');

    const start = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const rows = text
      .slice(start)
      .split('\n')
      .filter((line) => / 00000 n $/.test(line));
    expect(rows).toHaveLength(9);
    rows.forEach((row, i) =>
      expect(text.slice(Number(row.slice(0, 10)))).toMatch(
        new RegExp(`^${i + 1} 0 obj\\n`),
      ),
    );

    // The image stream is the page's pixels, as its Length says.
    const image = /\/Length (\d+) >>\nendobj|\/Length (\d+) >>\nstream\n/g;
    const lengths = [...text.matchAll(image)].map((m) => Number(m[2]));
    const at = text.indexOf('/Subtype /Image');
    const streamAt = text.indexOf('stream\n', at) + 7;
    const length = Number(/\/Length (\d+)/.exec(text.slice(at))![1]);
    expect(lengths).toContain(length);
    expect(inflateSync(pdf.subarray(streamAt, streamAt + length)).length).toBe(
      1080 * 1350 * 3,
    );
  });

  it('writes an ASCII title as a literal string, escaping its brackets', () => {
    const text = latin1(imagesPdf([], 'Picking (a) PM tool'));
    expect(text).toContain('/Title (Picking \\(a\\) PM tool)');
    expect(text).toContain('/Count 0');
  });
});
