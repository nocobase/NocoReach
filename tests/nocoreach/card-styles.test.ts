// @vitest-environment node
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({
  answers: [] as string[],
  calls: [] as { system: string; prompt: string; image?: unknown }[],
  error: null as unknown,
  info: { configured: true, images: true },
}));
vi.mock('../../server/nocoreach/execution/provider.js', () => {
  class ModelPreparationError extends Error {
    status: number;
    constructor(
      readonly reason: string,
      status = 409,
    ) {
      super(reason);
      this.status = status;
    }
  }
  class OnlineProvider {
    async complete(system: string, prompt: string) {
      model.calls.push({ system, prompt });
      if (model.error) throw model.error;
      return model.answers.shift() ?? '';
    }
    async completeWithImage(system: string, prompt: string, image: unknown) {
      model.calls.push({ system, prompt, image });
      if (model.error) throw model.error;
      return model.answers.shift() ?? '';
    }
    async imageInput() {
      return model.info;
    }
  }
  return { OnlineProvider, ModelPreparationError };
});

import {
  DESIGN_CSS_MAX,
  cleanCss,
  cleanDesign,
  cleanMarkup,
  designFonts,
  markupTree,
  savedStyleId,
  scopeCss,
  type CardDesign,
} from '../../shared/card-design.js';
import { pixelColors } from '../../shared/card-colors.js';
import {
  cardStyle,
  cardTemplate,
  drawnBySkill,
  styleBrief,
  styleOf,
} from '../../shared/xhs-card.js';
import {
  CardStyles,
  referenceImage,
  styleAnswer,
} from '../../server/nocoreach/card-styles.js';
import { ModelPreparationError } from '../../server/nocoreach/execution/provider.js';
import { resultRules } from '../../server/nocoreach/execution/agent-result.js';
import { taskMaterials } from '../../server/nocoreach/execution/task-materials.js';
import { demoSavedStyle } from '../../server/nocoreach/demo-data/card-style.js';

// Card styles made with AI and cards drawn by a Skill (2026-11-17, Content workshop): a model writes a style's HTML and
// CSS, which is drawn in the reviewer's browser and on the Agent's computer, so everything it writes is cleaned on the
// way in and out and the page that draws it runs only its own script.

const DESIGN: CardDesign = {
  css: '.card{display:flex;flex-direction:column;height:100%;background:#fff;color:#111}.heading{font-weight:800}.body{flex:1 1 0;min-height:0}',
  cover:
    '<div class="card"><div class="heading" data-slot="heading"></div><div class="body" data-slot="body"></div><span data-slot="logo"></span></div>',
  text: '<div class="card"><span data-slot="page"></span><div class="heading" data-slot="heading"></div><div class="body" data-slot="body"></div></div>',
  end: '<div class="card"><div class="heading" data-slot="heading"></div><div class="body" data-slot="body"></div></div>',
};

describe('Cleaning a style the model wrote', () => {
  it('keeps text and allowed elements, and drops scripts, handlers, links, images, frames and their contents', () => {
    const vectors = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg><script>alert(1)</script></svg>',
      '<svg onload=alert(1)><circle r="4"/></svg>',
      '<a href="javascript:alert(1)">x</a>',
      '<iframe src="https://evil.example"></iframe>',
      '<style>*{background:url(https://evil.example/x)}</style>',
      '<svg><foreignObject><body onload=alert(1)></foreignObject></svg>',
      '<math><mtext><img src=x onerror=alert(1)></mtext></math>',
      '<!--<script>alert(1)</script>-->',
      '<div onclick="alert(1)" onmouseover=alert(1)>t</div>',
      '<div style="background:url(javascript:alert(1))">t</div>',
      '<svg><a xlink:href="javascript:alert(1)"><circle r="2"/></a></svg>',
      '<svg><use href="https://evil.example/s.svg#x"/></svg>',
      '<form action="https://evil.example"><input name=a></form>',
      '<object data="x"></object><embed src="x">',
      '<template><img src=x onerror=alert(1)></template>',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
      '<div title="x" id="y" data-x="1">t</div>',
      '<<script>alert(1)//<</script>',
      '<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>',
      '<svg><path d="M0 0" fill="url(#g)" style="filter:url(https://e.example)"/></svg>',
      '<base href="https://evil.example/"><link rel=stylesheet href=x><meta http-equiv=refresh content="0;url=x">',
    ].join('');
    const { html } = cleanMarkup(`<div class="card ok">${vectors}</div>`);
    expect(html).not.toMatch(
      /<(script|img|iframe|style|a|form|input|object|embed|template|noscript|base|link|meta|use|foreignobject|math|body)\b/i,
    );
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(
      /javascript|url\(|https?:|xlink|href|src=|title=|id=|data-x/i,
    );
    // Escaped text stays text.
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html.startsWith('<div class="card ok">')).toBe(true);
    // A browser reading what is left finds no script, handler or link either.
    const { document } = new JSDOM(`<body>${html}</body>`).window;
    expect(
      document.querySelectorAll(
        'script,img,iframe,a,style,object,embed,link,meta,base',
      ).length,
    ).toBe(0);
    for (const e of document.querySelectorAll('*'))
      for (const a of e.attributes)
        expect(a.name).toMatch(
          /^(class|style|data-slot|aria-hidden|viewBox|r|d|fill|cx|cy)$/,
        );
  });

  it('keeps one of each slot, empties them, and writes elements of no meaning on an image as div and span', () => {
    const { html, slots } = cleanMarkup(
      '<section class="card"><h1 data-slot="heading">Sample heading</h1><ul data-slot="body"><li>x</li></ul><p data-slot="heading">again</p><label data-slot="nope">n</label></section>',
    );
    expect(slots).toEqual(['heading', 'body']);
    expect(html).toBe(
      '<div class="card"><h1 data-slot="heading"></h1><div data-slot="body"></div><p>again</p><span>n</span></div>',
    );
  });

  it('keeps plain rules inside the card, without at-rules, loads, escapes or font names', () => {
    const css = cleanCss(
      [
        '@import url(https://evil.example/a.css);',
        '@font-face{font-family:x;src:url(https://evil.example/f.woff)}',
        '@media (min-width:1px){.card{color:red}}',
        'body{background:red}',
        ':root{--x:1}',
        'html .card{color:red}',
        '[data-design] .x{color:red}',
        '.a{background:url(https://evil.example/i.png);color:#123456}',
        '.b{background-image:image-set("x.png" 1x);width:expression(alert(1));behavior:url(x.htc);-moz-binding:url(x)}',
        '.c{background:u\\72l(https://evil.example);color:red}',
        '.c2{background:u/**/rl(https://evil.example)}',
        ".e{font-family:'Comic Sans MS',var(--font-serif),serif;font:12px Arial}",
        '.f{color:blue;}}.g{color:green}',
        '.i::before{content:"·";color:var(--brand)}',
        '.h{content:"\\"}"}',
        '.d{color:red}</style><script>alert(1)</script>',
      ].join('\n'),
    );
    expect(css).not.toMatch(
      /@|url|image-set|expression|behavior|binding|\\|<|body|:root|html|data-design|Comic|Arial|font:|https?:/i,
    );
    expect(css.split('\n')).toEqual([
      '.a{color:#123456}',
      '.c{color:red}',
      '.e{font-family:var(--font-serif),serif}',
      '.f{color:blue}',
      '.g{color:green}',
      '.i::before{content:"·";color:var(--brand)}',
    ]);
    // A rule the model left open takes the next with it, as it would in a browser; nothing after it closes the style.
    expect(
      cleanCss('.d{color:red}</style><script>alert(1)</script>\n.k{color:red}'),
    ).toBe('.d{color:red}');
    expect(scopeCss('.a,.b>.c{color:red}')).toBe(
      '[data-design] .a,[data-design] .b>.c{color:red}',
    );
  });

  it('says what keeps a style from being used: a layout without its heading or body, or a part too long', () => {
    expect(cleanDesign(DESIGN).problems).toEqual([]);
    const { problems } = cleanDesign({
      ...DESIGN,
      end: '<div class="card"><div data-slot="heading"></div></div>',
      css: `.a{color:red}${'.b{color:blue}'.repeat(DESIGN_CSS_MAX)}`,
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        { kind: 'missing', layout: 'end', slot: 'body' },
        { kind: 'tooLong', part: 'css' },
      ]),
    );
    expect(cleanDesign(null).problems).toHaveLength(6);
    expect(designFonts(cleanDesign(DESIGN).design)).toEqual(['sans']);
    expect(designFonts(demoSavedStyle('zh').design)).toEqual(['serif']);
  });

  it('gives the template a tree of allowed elements, never markup to parse', () => {
    expect(
      markupTree(
        '<div class="card"><b data-slot="heading">x</b><svg viewBox="0 0 2 2" onload="x"><circle r="1"/></svg>t</div>',
      ),
    ).toEqual([
      [
        'div',
        { class: 'card' },
        [
          ['b', { 'data-slot': 'heading' }, []],
          ['svg', { viewBox: '0 0 2 2' }, [['circle', { r: '1' }, []]]],
          't',
        ],
      ],
    ]);
  });
});

describe('Drawing a style made with AI', () => {
  const style = {
    ...cardStyle(
      { color: '#1f4d3a', template: 'mine:abc' },
      { name: 'Acme', site: 'acme.example' },
      [
        {
          id: 'abc',
          name: 'Plain',
          summary: '',
          design: DESIGN,
          savedAt: '',
          savedBy: { id: '1', name: 'A' },
        },
      ],
    ),
  };

  it('resolves a saved style by its id, and one no longer saved to the default', () => {
    expect(style.template).toBe('custom');
    expect(style.name).toBe('Plain');
    expect(savedStyleId('mine:abc')).toBe('abc');
    expect(savedStyleId('mine:../x')).toBeNull();
    expect(cardStyle({ template: 'mine:gone' }, {}, []).template).toBe(
      'editorial',
    );
    // A set keeps the style it was drawn in, so Edit directly draws it again after the style is deleted.
    expect(styleOf(styleBrief(style), cardStyle(null, {})).design).toEqual(
      cleanDesign(DESIGN).design,
    );
  });

  it('runs only its own scripts, loads nothing from outside, and keeps the style inside the card', () => {
    const page = cardTemplate(
      {
        ...style,
        design: {
          ...DESIGN,
          css: `${DESIGN.css}.x{color:red}</style><script>alert(1)</script>`,
          cover: `${DESIGN.cover}<script>alert(2)</script><img src=x onerror=alert(3)>`,
        },
      },
      {
        cards: [
          {
            layout: 'cover',
            heading: '</script><script>alert(4)</script>',
            text: 'x',
          },
        ],
        n: 1,
      },
    );
    const nonce = /script-src 'nonce-([0-9a-f]{24})'/.exec(page)?.[1];
    expect(nonce).toBeTruthy();
    expect(page).toContain("default-src 'none'");
    expect(page).toContain('img-src data:');
    const scripts = page.match(/<script\b[^>]*>/g) || [];
    expect(scripts.length).toBe(2);
    for (const s of scripts) expect(s).toContain(`nonce="${nonce}"`);
    expect(page).not.toMatch(/alert\([123]\)/);
    expect(page).not.toContain('innerHTML');
    expect(page).toMatch(
      /<style id="design-css">[^<]*\[data-design\] \.card\{/,
    );
  });

  it('builds the layout, fills its slots with text, and says when a card does not fit', () => {
    const { window } = new JSDOM(
      cardTemplate(style, {
        cards: [
          {
            layout: 'cover',
            heading: 'Tickets in a day <b>bold</b>',
            text: 'One inbox',
          },
          {
            layout: 'text',
            heading: 'Owners',
            text: '- One owner.\n- One date.',
          },
        ],
      }),
      {
        runScripts: 'dangerously',
        // Sizing needs a browser's layout, so the fonts never load here; the cards are built before that.
        beforeParse: (w) =>
          Object.defineProperty(w.document, 'fonts', {
            value: { ready: new Promise(() => {}) },
          }),
      },
    );
    const cards = [...window.document.querySelectorAll('[data-design]')];
    expect(cards).toHaveLength(2);
    const heading = cards[0].querySelector('[data-slot="heading"]')!;
    expect(heading.querySelector('.first')?.textContent).toContain(
      '<b>bold</b>',
    );
    expect(heading.querySelector('b')).toBeNull();
    expect(cards[0].querySelector('[data-slot="logo"]')?.textContent).toBe('A');
    expect(cards[1].querySelector('[data-slot="page"]')?.textContent).toBe(
      '02 / 02',
    );
    expect(
      [...cards[1].querySelectorAll('.point .point-text')].map(
        (e) => e.textContent,
      ),
    ).toEqual(['One owner.', 'One date.']);
    expect(window.document.querySelector('#design-css')?.textContent).toContain(
      '[data-design] .heading{font-weight:800}',
    );
  });

  it('counts a drawn card’s colors as an uploaded card’s are counted', () => {
    const pixels = new Uint8ClampedArray(4 * 1000);
    for (let i = 0; i < 1000; i++)
      pixels.set(
        i < 700
          ? [255, 255, 255, 255]
          : i < 950
            ? [17, 17, 17, 255]
            : [31, 77, 58, 255],
        i * 4,
      );
    expect(pixels.length).toBe(4000);
    expect(pixelColors(pixels)).toEqual(['#ffffff', '#111111', '#1f4d3a']);
  });
});

describe('Cards a Skill draws', () => {
  const brief = styleBrief(
    cardStyle(
      {
        skill: 'guizang-social-card-skill',
        logo: 'data:image/png;base64,iVBORw0KGgo=',
      },
      { name: 'Acme' },
    ),
  );

  it('names the Skill, which the review card reads as drawn by it', () => {
    expect(brief.skill).toBe('guizang-social-card-skill');
    expect(drawnBySkill(brief)).toBe(true);
    expect(drawnBySkill(styleBrief(cardStyle(null, {})))).toBe(false);
    expect(drawnBySkill({ ...brief, skill: '../x' })).toBe(false);
  });

  it('tells the Agent to draw with the Skill instead of a template, with the logo beside it', () => {
    const rules = resultRules(
      'plan',
      'xhsCards',
      'guizang-social-card-skill',
    ).join('\n');
    expect(rules).toContain('Skill guizang-social-card-skill');
    expect(rules).not.toContain('materials.cardTemplate');
    expect(resultRules('plan', 'xhsCards').join('\n')).toContain(
      'materials.cardTemplate',
    );
    const bundle = taskMaterials({
      mode: 'plan',
      step: 'analyze',
      title: 't',
      cardLogo: 'data:image/png;base64,AAAA',
    } as never);
    expect(bundle.bundle.files.map((f) => f.path)).toContain('xhs-logo.txt');
    expect(JSON.stringify(bundle.context)).not.toContain('base64,AAAA');
    expect(bundle.offer.note).toContain('xhs-logo.txt');
  });
});

describe('My styles on the server', () => {
  const fixture = () => {
    const rows: { id: number; key: string; payload: unknown }[] = [];
    let id = 1;
    const p = {
      db: {
        sequelize: {
          transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({}),
          query: async () => undefined,
        },
        getRepository: () => ({
          findOne: async ({ filter }: { filter: { key: string } }) => {
            const r = rows.find((x) => x.key === filter.key);
            return r
              ? {
                  get: (k: string) =>
                    structuredClone((r as Record<string, unknown>)[k]),
                }
              : null;
          },
          update: async ({
            filterByTk,
            values,
          }: {
            filterByTk: number;
            values: { payload: unknown };
          }) => {
            rows.find((x) => x.id === filterByTk)!.payload = structuredClone(
              values.payload,
            );
          },
          create: async ({
            values,
          }: {
            values: { key: string; payload: unknown };
          }) => {
            rows.push({ id: id++, ...structuredClone(values) });
          },
        }),
      },
    };
    return { styles: new CardStyles(p as never), rows };
  };
  const actor = { id: '7', name: 'Hechuan' };
  beforeEach(() => {
    model.answers = [];
    model.calls = [];
    model.error = null;
  });

  it('saves a complete style cleaned, renames it, and deletes it unless the brand kit draws with it', async () => {
    const { styles } = fixture();
    const saved = await styles.save(
      '1',
      {
        name: ' Forest ',
        summary: 'Green',
        design: { ...DESIGN, cover: `${DESIGN.cover}<script>x</script>` },
      },
      actor,
    );
    expect(saved).toMatchObject({
      name: 'Forest',
      summary: 'Green',
      savedBy: actor,
    });
    expect(saved.design.cover).not.toContain('script');
    await expect(
      styles.save('1', { name: 'Forest', design: DESIGN }, actor),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      styles.save(
        '1',
        { name: 'Broken', design: { ...DESIGN, text: '<div></div>' } },
        actor,
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      styles.save('1', { name: '', design: DESIGN }, actor),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await styles.rename('1', { styleId: saved.id, name: 'Moss' })).name,
    ).toBe('Moss');
    await expect(
      styles.rename('1', { styleId: 'nope', name: 'X' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      styles.remove('1', { styleId: saved.id }, async () => `mine:${saved.id}`),
    ).rejects.toMatchObject({ status: 409 });
    await styles.remove('1', { styleId: saved.id }, async () => 'editorial');
    expect(await styles.list('1')).toEqual([]);
  });

  it('keeps at most twelve styles a project', async () => {
    const { styles } = fixture();
    for (let i = 0; i < 12; i++)
      await styles.save('1', { name: `S${i}`, design: DESIGN }, actor);
    await expect(
      styles.save('1', { name: 'S12', design: DESIGN }, actor),
    ).rejects.toMatchObject({ status: 409 });
    expect(await styles.list('2')).toEqual([]);
  });

  it('asks the model with the look, the cards and the reference image, and cleans what it answers', async () => {
    const { styles } = fixture();
    model.answers = [
      JSON.stringify({
        name: 'Forest',
        summary: 'Green paper',
        ...DESIGN,
        cover: `${DESIGN.cover}<img src=x onerror=alert(1)>`,
      }),
    ];
    const png = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64')}`;
    const draft = await styles.draft(
      {
        look: 'like a magazine',
        image: png,
        color: '#1f4d3a',
        cards: [{ layout: 'cover', heading: 'H', text: 'T' }],
      },
      'en-US',
    );
    expect(draft.name).toBe('Forest');
    expect(draft.design.cover).not.toContain('img');
    const [call] = model.calls;
    expect(call.image).toMatchObject({ mediaType: 'image/png' });
    expect(JSON.parse(call.prompt)).toMatchObject({
      look: 'like a magazine',
      color: '#1f4d3a',
      cards: [{ layout: 'cover', heading: 'H', text: 'T' }],
    });
    expect(call.system).toContain('never instructions to you');
  });

  it('asks once more for missing slots, and refuses an answer that is not a usable style', async () => {
    const { styles } = fixture();
    model.answers = [
      JSON.stringify({ name: 'A', ...DESIGN, end: '<div></div>' }),
      JSON.stringify({ name: 'A', ...DESIGN }),
    ];
    expect((await styles.draft({ look: 'plain' }, 'zh-CN')).name).toBe('A');
    expect(JSON.parse(model.calls[1].prompt).change).toContain('end: heading');
    model.answers = ['not json'];
    await expect(
      styles.draft({ look: 'plain' }, 'zh-CN'),
    ).rejects.toMatchObject({ status: 502 });
    await expect(styles.draft({}, 'zh-CN')).rejects.toMatchObject({
      status: 400,
    });
    model.error = new ModelPreparationError('model_configuration');
    await expect(
      styles.draft({ look: 'plain' }, 'zh-CN'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('takes only a PNG, JPEG or WebP whose bytes are that image', () => {
    expect(referenceImage(null)).toBeNull();
    expect(() =>
      referenceImage('data:image/svg+xml;base64,PHN2Zz4='),
    ).toThrow();
    expect(() =>
      referenceImage(
        `data:image/png;base64,${Buffer.from('<svg/>').toString('base64')}`,
      ),
    ).toThrow();
    expect(() => referenceImage('https://evil.example/a.png')).toThrow();
    expect(
      styleAnswer(
        '```json\n' +
          JSON.stringify({ name: 'N', summary: 'S', ...DESIGN }) +
          '\n```',
      )?.problems,
    ).toEqual([]);
    expect(styleAnswer('{"css":1}')).toBeNull();
  });
});
