// A LinkedIn carousel's PDF (Content workshop, 2026-11-24): LinkedIn takes a carousel as one document, so the done card
// downloads the set's card images as the pages of one PDF, built here in the browser without a library. Each page is
// one image filling it, kept lossless: its RGB pixels compressed with the browser's own deflate (FlateDecode), or the
// card re-encoded as a JPEG (DCTDecode) where the browser has no CompressionStream. A page is the image's size at
// 96 dpi (1080 × 1350 px is 810 × 1012.5 pt).

/** One page: an image's size in pixels and its encoded data. */
export type PdfPage = {
  width: number;
  height: number;
  filter: 'FlateDecode' | 'DCTDecode';
  data: Uint8Array;
};

const encoder = new TextEncoder();

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The RGB bytes of an image's pixels, dropping alpha (the cards are opaque). */
export function rgbOf(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const out = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    out[j] = rgba[i];
    out[j + 1] = rgba[i + 1];
    out[j + 2] = rgba[i + 2];
  }
  return out;
}

/** A card image as a PDF page: decoded on a canvas, then deflated, or a JPEG where deflate is missing. */
export async function pdfPageOf(image: Blob): Promise<PdfPage> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No canvas to read the card on.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { width, height } = canvas;
  if (typeof CompressionStream === 'function')
    return {
      width,
      height,
      filter: 'FlateDecode',
      data: await deflate(
        rgbOf(context.getImageData(0, 0, width, height).data),
      ),
    };
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The card was not encoded.')),
      'image/jpeg',
      0.95,
    ),
  );
  return {
    width,
    height,
    filter: 'DCTDecode',
    data: new Uint8Array(await jpeg.arrayBuffer()),
  };
}

/** A PDF text string: ASCII as it is, anything else as UTF-16BE with a byte order mark. */
function pdfString(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text))
    return `(${text.replace(/[\\()]/g, (c) => `\\${c}`)})`;
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++)
    hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

const points = (px: number) => Number((px * 0.75).toFixed(2));

/** A PDF of the pages in order, each one image filling its page; `title` is the document's own title. */
export function imagesPdf(pages: PdfPage[], title?: string): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };
  // 1 the catalog, 2 the page tree, 3 the document information; then per page: the page, its drawing and its image.
  const first = 4;
  const pageRef = (i: number) => first + i * 3;
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(
    2,
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageRef(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  object(
    3,
    `<< /Producer (NocoReach)${title?.trim() ? ` /Title ${pdfString(title.trim())}` : ''} >>`,
  );
  pages.forEach((page, i) => {
    const n = pageRef(i);
    const w = points(page.width),
      h = points(page.height);
    const draw = encoder.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    object(
      n,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`,
    );
    object(n + 1, `<< /Length ${draw.length} >>`, draw);
    object(
      n + 2,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${page.filter} /Length ${page.data.length} >>`,
      page.data,
    );
  });
  const size = pageRef(pages.length);
  const xref = length;
  push(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let n = 1; n < size; n++)
    push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(
    `trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
