// @vitest-environment node
import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import {
  XHS,
  cardChars,
  parseRepurpose,
  repurposeChecks,
  sectionNumbers,
  sourceSections,
  writeXhs,
} from '../../shared/repurpose.js';
import {
  CARD_COLOR,
  CARD_TEMPLATES,
  DEFAULT_TEMPLATE,
  cardStyle,
  cardTemplate,
  styleBrief,
  styleOf,
} from '../../shared/xhs-card.js';
import {
  pngInfo,
  pngSize,
  setColors,
} from '../../server/nocoreach/png-colors.js';
import { resultOf } from '../../server/nocoreach/execution/agent-result.js';
import { taskMaterials } from '../../server/nocoreach/execution/task-materials.js';
import { crc32 as zipCrc, zipStored } from '../../client/lib/zip.js';

// Content workshop PR 2 (2026-11-16): Xiaohongshu cards, from the result's text to the checks on review, the template
// the Agent renders with, the colors read from its images and the ZIP the done card downloads.

const result = (
  cards: string[],
  note = ['## Title', 'Tickets', '## Body', 'Two tables.'],
) => [...note, ...cards].join('\n');
const card = (
  n: number,
  heading: string,
  text: string,
  label = `Sections: ${n}`,
) => `## Card ${n}\n${label}\n# ${heading}\n${text}`;

describe('Xiaohongshu result text', () => {
  it('reads the cards in order, the first the cover, a closing page by its layout, and the note around them', () => {
    const parsed = parseRepurpose(
      'xhs',
      result([
        card(1, 'Tickets in a day', 'From one inbox', 'Sections: 1–3'),
        card(3, 'Owners', 'Each card has one.\nAlways.'),
        '## 卡片 7\nLayout: end\nSections: 4\n# Follow Acme\nacme.example',
      ]),
    )!;
    expect(
      parsed.pieces.map((p) => [
        p.kind,
        p.index,
        p.layout,
        p.heading,
        p.sections,
        p.text,
      ]),
    ).toEqual([
      ['title', undefined, undefined, undefined, undefined, 'Tickets'],
      ['body', undefined, undefined, undefined, undefined, 'Two tables.'],
      ['card', 1, 'cover', 'Tickets in a day', '1–3', 'From one inbox'],
      ['card', 2, 'text', 'Owners', '3', 'Each card has one.\nAlways.'],
      ['card', 3, 'end', 'Follow Acme', '4', 'acme.example'],
    ]);
    // A note without cards is not a set of cards.
    expect(
      parseRepurpose('xhs', '## Title\nTickets\n## Body\nTwo tables.'),
    ).toBeNull();
  });

  it('writes edited pieces back in the format it reads, a line of text never becoming a heading', () => {
    const text = result([
      card(1, 'Tickets in a day', 'From one inbox', 'Sections: 1–3'),
      card(2, 'Owners', 'Each card has one.'),
      '## Card 3\nLayout: end\n# Follow Acme\nacme.example',
    ]);
    const pieces = parseRepurpose('xhs', text)!.pieces;
    expect(parseRepurpose('xhs', writeXhs(pieces))!.pieces).toEqual(pieces);
    const edited = pieces.map((p) =>
      p.index === 2
        ? { ...p, heading: ' New owners ', text: '# Not a heading\n## Card 9' }
        : p,
    );
    const again = parseRepurpose('xhs', writeXhs(edited))!.pieces;
    expect(again.filter((p) => p.kind === 'card')).toHaveLength(3);
    expect(again.find((p) => p.index === 2)).toMatchObject({
      heading: 'New owners',
      text: 'Not a heading\nCard 9',
      sections: '2',
      layout: 'text',
    });
    expect(again.find((p) => p.index === 3)?.layout).toBe('end');
  });

  it('counts a card’s heading and text without spaces, and reads section ranges', () => {
    expect(
      cardChars({ kind: 'card', heading: 'Ab c', text: '中文 d\ne' }),
    ).toBe(7);
    expect(sectionNumbers('1–3, 5')).toEqual([1, 2, 3, 5]);
    expect(sectionNumbers('2-1')).toEqual([1, 2]);
    expect(sectionNumbers(undefined)).toEqual([]);
  });

  it('numbers an article’s sections by its second-level headings, else its third; a topic’s by its key points', () => {
    expect(
      sourceSections({
        body: '# A\n## Why\ntext\n## How\n### Detail\n## Again',
      }),
    ).toEqual(['Why', 'How', 'Again']);
    expect(sourceSections({ body: '### One\n### Two' })).toEqual([
      'One',
      'Two',
    ]);
    expect(sourceSections({ body: '## Only one' })).toEqual([]);
    expect(
      sourceSections({ points: '- First point\n2. Second point\n\n' }),
    ).toEqual(['First point', 'Second point']);
  });
});

describe('Xiaohongshu checks', () => {
  const six = (overrides: Record<number, string> = {}) =>
    Array.from(
      { length: 6 },
      (_, i) =>
        overrides[i + 1] ??
        card(
          i + 1,
          `Step ${i + 1}`,
          'One owner.',
          `Sections: ${Math.min(i + 1, 3)}`,
        ),
    );
  const keys = (text: string, cards = {}) =>
    repurposeChecks('xhs', parseRepurpose('xhs', text)!, {
      cards: { images: [], ...cards },
    }).map((c) => [c.key, c.ok, c.params]);

  it('passes a set within every limit, and leaves out what NocoReach could not tell', () => {
    expect(keys(result(six()))).toEqual([
      ['workshop.check.coverWithin', true, { 0: 6, 1: XHS.coverTitle }],
      ['workshop.check.cardsWithin', true, { 0: 6, 1: 6, 2: 18 }],
      ['workshop.check.cardCharsWithin', true, { 0: XHS.cardChars }],
    ]);
    expect(
      keys(result(six()), {
        sections: 3,
        colors: ['#000000', '#ffffff'],
        overflow: [],
      }).map(([k]) => k),
    ).toEqual([
      'workshop.check.sectionsAll',
      'workshop.check.coverWithin',
      'workshop.check.cardsWithin',
      'workshop.check.colorsWithin',
      'workshop.check.noOverflow',
      'workshop.check.cardCharsWithin',
    ]);
  });

  it('names the sections left out, a long cover heading, too few cards, too many colors, overflow and each long card', () => {
    const long = '字'.repeat(XHS.cardChars);
    const checks = keys(
      result(
        six({
          1: card(1, '一'.repeat(21), 'x'),
          4: card(4, 'Long', long),
          5: card(5, 'Also', long),
        }).slice(0, 5),
      ),
      {
        sections: 7,
        colors: ['#000000', '#ffffff', '#ff0000', '#00ff00'],
        overflow: [2, 4],
      },
    );
    expect(checks).toEqual([
      ['workshop.check.sectionsMissing', false, { 0: '6, 7', 1: 7 }],
      ['workshop.check.coverOver', false, { 0: 21, 1: 20 }],
      ['workshop.check.cardsOut', false, { 0: 5, 1: 6, 2: 18 }],
      ['workshop.check.colorsOver', false, { 0: 4, 1: 3 }],
      ['workshop.check.overflow', false, { 0: '2, 4' }],
      ['workshop.check.cardCharsOver', false, { 0: 4, 1: 114, 2: 110 }],
      ['workshop.check.cardCharsOver', false, { 0: 5, 1: 114, 2: 110 }],
    ]);
  });
});

describe('Xiaohongshu result envelope', () => {
  const report = {
    kind: 'xhsCards',
    sources: [],
    asOf: '2026-11-16',
    uncertainties: [],
  };
  const ids = (n: number) =>
    Array.from(
      { length: n },
      (_, i) => `00000000-0000-4000-8000-00000000000${i}`,
    );
  const of = (v: object) => () =>
    resultOf(
      JSON.stringify({ ok: true, report, ...v }),
      'plan',
      'xhsCards',
      '1',
    );

  it('takes one image per card, each once, and overflow only of cards that exist', () => {
    const text = result(
      Array.from({ length: 6 }, (_, i) => card(i + 1, `S${i}`, 'x')),
    );
    expect(
      of({ content: text, cards: { images: ids(6), overflow: [6] } })(),
    ).toMatchObject({ cards: { images: ids(6), overflow: [6] } });
    expect(of({ content: text, cards: { images: ids(5) } })).toThrow(/6.*5/);
    expect(
      of({ content: text, cards: { images: [...ids(5), ids(5)[0]] } }),
    ).toThrow();
    expect(
      of({ content: text, cards: { images: ids(6), overflow: [7] } }),
    ).toThrow(/cards\.overflow/);
    expect(of({ content: text })).toThrow();
    expect(
      of({ content: '## Title\nOnly', cards: { images: ids(6) } }),
    ).toThrow();
    expect(of({ content: text, cards: { images: ['not-an-id'] } })).toThrow(
      /cards\.images/,
    );
  });
});

describe('Xiaohongshu card template', () => {
  const icon = 'data:image/png;base64,iVBORw0KGgo=';
  const style = cardStyle(
    {
      template: 'dark',
      color: '#1E40AF',
      ending: { heading: 'Follow', text: 'acme.example' },
    },
    {
      name: 'Acme</script><script>alert(1)</script>',
      site: 'acme.example',
      icon,
    },
  );

  it('takes the brand kit’s style and color with defaults for what is missing or invalid, the website icon as the logo', () => {
    expect(style).toMatchObject({
      template: 'dark',
      color: '#1e40af',
      logo: icon,
      ending: { heading: 'Follow', text: 'acme.example' },
    });
    expect(
      cardStyle(
        { template: 'poster' as never, color: 'red' },
        { name: 'Acme' },
      ),
    ).toMatchObject({ template: DEFAULT_TEMPLATE, color: CARD_COLOR });
    expect(
      cardStyle(null, { name: 'Acme', icon: 'javascript:alert(1)' }),
    ).not.toHaveProperty('logo');
    // The Agent is told whether there is a logo; only the template carries its bytes.
    expect(styleBrief(style).logo).toBe(true);
  });

  it('draws an edit with the style its set was drawn in and the logo the brand kit has now', () => {
    const now = cardStyle(
      { template: 'memo', color: '#0f766e' },
      { name: 'Acme', icon: 'data:image/png;base64,bmV3' },
    );
    expect(styleOf(styleBrief(style), now)).toMatchObject({
      template: 'dark',
      color: '#1e40af',
      logo: 'data:image/png;base64,bmV3',
      ending: { heading: 'Follow', text: 'acme.example' },
    });
    expect(
      styleOf({ ...styleBrief(style), logo: false }, now),
    ).not.toHaveProperty('logo');
    // A set from before styles were recorded is drawn in the brand kit's style now.
    expect(styleOf(undefined, now)).toBe(now);
  });

  it('draws every built-in style from the same page, which tells its parent when it has measured the cards', () => {
    for (const template of CARD_TEMPLATES) {
      const page = cardTemplate(
        { ...style, template },
        {
          cards: [{ layout: 'cover', heading: 'H', text: 'T' }],
          exporting: true,
        },
      );
      expect(page).toContain(JSON.stringify(template));
      expect(page).toContain('window.CARD_EXPORT = true;');
      expect(page).toContain('nocoreach-xhs-card');
    }
  });

  it('writes the style as data that cannot close the script, and the cards beside it or inline for a preview', () => {
    const page = cardTemplate(style);
    expect(page).toContain('<script src="cards.js"></script>');
    expect(page).not.toContain('</script><script>alert');
    expect(page).toContain('\\u003c/script>');
    expect(cardTemplate(style, 'x" onload="alert(1)')).toContain(
      '<script src="xonloadalert1"></script>',
    );
    const preview = cardTemplate(style, {
      cards: [{ layout: 'cover', heading: '</script>', text: '' }],
      n: 1,
    });
    expect(preview).toContain(
      'window.CARDS = [{"layout":"cover","heading":"\\u003c/script>","text":""}]; window.CARD_N = 1;',
    );
    // Text is set as text, never as markup.
    expect(page).toContain('e.textContent = text');
    expect(page).not.toContain('innerHTML');
  });

  it('goes to the run as a material file, outside the prompt', () => {
    const bundle = taskMaterials({
      mode: 'plan',
      step: 'analyze',
      title: 't',
      cardTemplate: cardTemplate(style),
    } as never);
    expect(bundle.bundle.files.map((f) => f.path)).toContain('xhs-card.html');
    expect(JSON.stringify(bundle.context)).not.toContain('<!doctype html>');
    expect(JSON.stringify(bundle.context)).toContain('xhs-card.html');
  });
});

/** A PNG of rows of colors, as a browser's screenshot writes one (8-bit, no interlace). */
function png(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number,
  type: 2 | 3 = 2,
  palette: number[] = [],
) {
  const chunk = (kind: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(kind, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(
      crc32(Buffer.concat([Buffer.from(kind, 'latin1'), data])),
      0,
    );
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = type;
  const channels = type === 2 ? 3 : 1;
  const raw = Buffer.alloc(height * (width * channels + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * channels + 1);
    // Alternate the filters the decoder reverses: none, sub, up.
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const v = pixel(x, y);
      if (type === 3) raw[row + 1 + x] = v;
      else raw.writeUIntBE(v, row + 1 + x * 3, 3);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    ...(type === 3
      ? [
          chunk(
            'PLTE',
            Buffer.from(
              palette.flatMap((c) => [c >> 16, (c >> 8) & 255, c & 255]),
            ),
          ),
        ]
      : []),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('Card image colors', () => {
  const blend = (a: number, b: number, t: number) =>
    [16, 8, 0].reduce(
      (sum, shift) =>
        sum |
        (Math.round(
          ((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t,
        ) <<
          shift),
      0,
    );
  const [primary, text, background] = [0x1e40af, 0x0f172a, 0xf8fafc];

  it('counts a card’s colors as a person would: blends of two and near shades are not colors of their own', () => {
    // A brand band, text, text drawn at 60% opacity, anti-aliased edges and a shade one step off the background.
    const card = png(XHS.width, XHS.height, (x, y) =>
      y < 144
        ? primary
        : y < 220
          ? text
          : y < 300
            ? blend(text, background, 0.4)
            : y < 304
              ? blend(primary, background, (x % 7) / 7)
              : y < 400 && x < 300
                ? background - 0x030303
                : background,
    );
    expect(pngSize(card)).toEqual({ width: 1080, height: 1440 });
    const info = pngInfo(card)!;
    expect(new Set(info.colors)).toEqual(
      new Set(['#f8fafc', '#1e40af', '#0f172a']),
    );
    // A fourth color is one.
    const loud = png(200, 200, (x) =>
      x < 50 ? primary : x < 100 ? text : x < 150 ? 0xdc2626 : background,
    );
    expect(pngInfo(loud)!.colors).toHaveLength(4);
  });

  it('reads indexed PNGs, keeps the size of one it cannot decode, and ignores what is not a PNG', () => {
    const indexed = png(100, 100, (x) => (x < 50 ? 0 : 1), 3, [
      primary,
      background,
    ]);
    expect(new Set(pngInfo(indexed)!.colors)).toEqual(
      new Set(['#1e40af', '#f8fafc']),
    );
    const sixteen = Buffer.from(indexed);
    sixteen[24] = 16;
    expect(pngInfo(sixteen)).toEqual({ width: 100, height: 100 });
    expect(pngInfo(Buffer.from('RIFF0000WEBPVP8 '))).toBeNull();
  });

  it('counts a set’s colors across its cards', () => {
    expect(
      setColors([['#1e40af', '#f8fafc'], ['#f8fafc', '#0f172a'], ['#f7f9fb']]),
    ).toEqual(['#1e40af', '#f8fafc', '#0f172a']);
  });
});

describe('Download of the card images', () => {
  it('stores each file under its UTF-8 name with its CRC, and a directory that finds them', async () => {
    expect(zipCrc(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const files = [
      { name: 'T-61-01.png', data: new Uint8Array([1, 2, 3]) },
      { name: '卡片-02.png', data: new Uint8Array([4, 5]) },
    ];
    const bytes = Buffer.from(
      await zipStored(files, new Date(2026, 10, 16, 9, 30)).arrayBuffer(),
    );
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    const end = bytes.length - 22;
    expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
    expect(bytes.readUInt16LE(end + 10)).toBe(2);
    let at = bytes.readUInt32LE(end + 16);
    const names = [];
    for (let i = 0; i < 2; i++) {
      expect(bytes.readUInt32LE(at)).toBe(0x02014b50);
      const length = bytes.readUInt16LE(at + 28),
        offset = bytes.readUInt32LE(at + 42),
        size = bytes.readUInt32LE(at + 24);
      names.push(bytes.toString('utf8', at + 46, at + 46 + length));
      const local = offset + 30 + bytes.readUInt16LE(offset + 26);
      expect([...bytes.subarray(local, local + size)]).toEqual([
        ...files[i].data,
      ]);
      expect(bytes.readUInt32LE(at + 16)).toBe(zipCrc(files[i].data));
      at += 46 + length;
    }
    expect(names).toEqual(['T-61-01.png', '卡片-02.png']);
  });
});
