/**
 * Card styles made with AI (2026-11-17 user decision, Content workshop; mockup xhs-card-styles.html frame 3). A model
 * writes a whole style: CSS and the markup of the three card layouts, with slots NocoReach fills with the card's text,
 * the brand and the page number. The card template draws it (shared/xhs-card.ts), sizes the text in the slots as it
 * does a built-in style's, and reports the cards whose text does not fit.
 *
 * A style is model-written HTML and CSS drawn in the reviewer's browser and on the Agent's computer, so it goes through
 * `cleanDesign` wherever it comes in or goes out: in the browser on the model's answer, on the server on every save and
 * whenever the template is built. The cleaner keeps an allow-list and writes everything out again itself rather than
 * filtering the input:
 * - markup: a few text and SVG shape elements, `class`, `style`, `data-slot` and shape attributes; no scripts, event
 *   handlers, links, images, frames or forms, whose contents go too;
 * - CSS: plain rules whose selectors stay inside the card (`[data-design] ` is put before each, and none may name
 *   `html`, `body` or `:root`), no at-rules (`@import`, `@font-face`, `@media`), no `url()` or other functions that load
 *   anything, no escapes, and font families only from `DESIGN_FONTS`;
 * - sizes: at most `DESIGN_CSS_MAX` characters of CSS and `DESIGN_MARKUP_MAX` of each layout's markup.
 * The template page adds a Content-Security-Policy that runs only its own script and loads nothing from outside, and is
 * shown in frames sandboxed without same-origin (CardFrame, card-render.ts).
 */

export const DESIGN_LAYOUTS = ['cover', 'text', 'end'] as const;
export type DesignLayout = (typeof DESIGN_LAYOUTS)[number];

/** A card style a model wrote: its CSS and each layout's markup, cleaned. */
export type CardDesign = Record<DesignLayout, string> & { css: string };

export const DESIGN_CSS_MAX = 20_000;
export const DESIGN_MARKUP_MAX = 8_000;
/** What a person may ask of the model: the look, and a change to the one shown. */
export const DESIGN_PROMPT_MAX = 500;
export const DESIGN_CHANGE_MAX = 300;
export const DESIGN_NAME_MAX = 20;
export const DESIGN_SUMMARY_MAX = 80;
/** A reference image: a PNG, JPEG or WebP data URL of at most this many bytes. */
export const DESIGN_IMAGE_BYTES = 4 * 1024 * 1024;
export const DESIGN_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
/** How many styles a project keeps in My styles. */
export const SAVED_STYLES_MAX = 12;

/**
 * Where the template puts each part of a card: `heading` and `body` are sized to fit (a text card's body holds its
 * points), `contents` lists a cover's following cards, `logo` holds the logo or the brand's first letter, and the others
 * hold short text (`page` is "03 / 08", `no` "03", `total` "08").
 */
export const DESIGN_SLOTS = [
  'heading',
  'body',
  'brand',
  'site',
  'page',
  'no',
  'total',
  'logo',
  'contents',
] as const;
export type DesignSlot = (typeof DESIGN_SLOTS)[number];
/** Every layout has a heading and a body. */
export const REQUIRED_SLOTS: readonly DesignSlot[] = ['heading', 'body'];

/**
 * The fonts a style may use, by the CSS variable the template sets on every card: open-licensed families free for
 * commercial use (Source Han Sans and Serif, also published as Noto Sans and Serif CJK, under the SIL Open Font License),
 * each falling back to the system's own sans-serif, serif or monospaced font where they are not installed. NocoReach
 * ships no font files: the Agent's computer and the reviewer's browser draw with what they have.
 */
export const DESIGN_FONTS = {
  sans: "'Source Han Sans SC','Noto Sans CJK SC','Noto Sans SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Helvetica Neue',Arial,sans-serif",
  serif:
    "'Source Han Serif SC','Noto Serif CJK SC','Noto Serif SC','Songti SC','STSong','SimSun',Georgia,'Times New Roman',serif",
  mono: "'Noto Sans Mono CJK SC','Source Han Mono SC','SF Mono',Menlo,Consolas,monospace",
} as const;
export type DesignFont = keyof typeof DESIGN_FONTS;
const FONT_VARS = new Map(
  (Object.keys(DESIGN_FONTS) as DesignFont[]).map((k) => [
    `var(--font-${k})`,
    k,
  ]),
);
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'system-ui',
]);

/** The fonts a cleaned style uses: those its CSS names, else the cards' own sans-serif. */
export function designFonts(design: CardDesign): DesignFont[] {
  const text = [design.css, design.cover, design.text, design.end].join('\n');
  const used = (Object.keys(DESIGN_FONTS) as DesignFont[]).filter((k) =>
    text.includes(`var(--font-${k})`),
  );
  return used.length ? used : ['sans'];
}

// ---------------------------------------------------------------------------------------------------------------------
// CSS

/** The CSS functions that fetch or build images, or run script in old browsers; a declaration using one goes. */
const LOADING =
  /(?:url|image-set|-webkit-image-set|image|element|expression|cross-fade|-webkit-cross-fade|paint|src)\s*\(/i;
const DROPPED_PROPERTIES = new Set(['behavior', '-moz-binding', 'src', 'font']);
const SELECTOR = /^[A-Za-z0-9\s.#_\-:>+~*()[\]="'^$|]+$/;
const OUTSIDE =
  /(?:^|[\s>+~(,])(?:html|body|head)\b|:root|:host|::part|::slotted|\[data-design\]|\[data-card\]/i;

/** Splits at `sep` outside quotes and brackets. */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0,
    quote = '',
    start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

function cleanValue(property: string, raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value || value.length > 600) return null;
  if (
    LOADING.test(value) ||
    /javascript\s*:/i.test(value) ||
    /[<>{}@\\]/.test(value)
  )
    return null;
  if (property === 'font-family') {
    const kept = splitTop(value.replace(/\s*!important$/i, ''), ',')
      .map((f) => f.trim())
      .filter((f) => FONT_VARS.has(f) || GENERIC_FAMILIES.has(f.toLowerCase()));
    return kept.length
      ? kept.join(',') + (/!important$/i.test(value) ? ' !important' : '')
      : null;
  }
  // Quotes must pair, or the declaration could run into the next.
  const quotes = value.replace(/"[^"]*"|'[^']*'/g, '');
  if (/["']/.test(quotes)) return null;
  return value;
}

/** A rule's declarations, cleaned: `property:value` joined with `;`. */
export function cleanDeclarations(block: string): string {
  const out: string[] = [];
  for (const part of splitTop(block, ';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const name = part.slice(0, at).trim().toLowerCase();
    const custom = /^--[a-z0-9-]{1,40}$/.test(name);
    if (!custom && !/^-?[a-z][a-z0-9-]{0,40}$/.test(name)) continue;
    if (DROPPED_PROPERTIES.has(name)) continue;
    const value = cleanValue(name, part.slice(at + 1));
    if (value != null) out.push(`${name}:${value}`);
  }
  return out.join(';');
}

/** The selectors of a rule that stay inside the card, kept as written. */
function cleanSelectors(text: string): string[] {
  return splitTop(text, ',')
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(
      (s) => s && s.length <= 200 && SELECTOR.test(s) && !OUTSIDE.test(s),
    );
}

/** The index just past the block that opens at `open` (a `{`), or the end. */
function blockEnd(css: string, open: number): number {
  let depth = 0,
    quote = '';
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return css.length;
}

/**
 * A style's CSS, cleaned and written out again as plain rules, each `selectors{declarations}`; selectors are kept as the
 * model wrote them (`scopeCss` puts the card before them when the template is built).
 */
export function cleanCss(input: string): string {
  // Escapes and angle brackets have no use in a card's CSS and could hide a function or end the style element: a
  // declaration or selector with one goes (cleanValue, SELECTOR).
  const css = String(input || '').replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '');
  const rules: string[] = [];
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (/\s|;|}/.test(c)) {
      i++;
      continue;
    }
    const open = css.indexOf('{', i),
      semi = css.indexOf(';', i);
    if (c === '@') {
      // At-rules go whole: @import and @font-face load things, and a card needs no @media or @keyframes.
      i =
        open >= 0 && (semi < 0 || open < semi)
          ? blockEnd(css, open)
          : semi >= 0
            ? semi + 1
            : css.length;
      continue;
    }
    if (open < 0) break;
    if (semi >= 0 && semi < open) {
      // A declaration outside any rule.
      i = semi + 1;
      continue;
    }
    const end = blockEnd(css, open);
    const selectors = cleanSelectors(css.slice(i, open));
    // Nested rules inside a block go with it.
    const body = css.slice(open + 1, end - 1);
    const declarations = /[{}]/.test(body) ? '' : cleanDeclarations(body);
    if (selectors.length && declarations)
      rules.push(`${selectors.join(',')}{${declarations}}`);
    i = end;
  }
  return rules.join('\n');
}

/** Cleaned CSS with the card before every selector, as the template puts it on the page. */
export function scopeCss(css: string): string {
  return css
    .split('\n')
    .map((rule) => {
      const open = rule.indexOf('{');
      if (open < 0) return '';
      const selectors = splitTop(rule.slice(0, open), ',').map(
        (s) => `[data-design] ${s.trim()}`,
      );
      return `${selectors.join(',')}${rule.slice(open)}`;
    })
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------
// Markup

const HTML_ELEMENTS = new Set([
  'div',
  'span',
  'p',
  'br',
  'hr',
  'b',
  'strong',
  'i',
  'em',
  'small',
  'sup',
  'sub',
  'u',
  's',
  'mark',
  'h1',
  'h2',
  'h3',
  'h4',
]);
/** Elements written out as a `div` or a `span`: their meaning does not matter on an image. */
const AS_DIV = new Set([
  'section',
  'header',
  'footer',
  'article',
  'main',
  'aside',
  'nav',
  'figure',
  'figcaption',
  'ul',
  'ol',
  'li',
  'blockquote',
  'dl',
  'dt',
  'dd',
  'address',
]);
const AS_SPAN = new Set(['label', 'code', 'time', 'abbr', 'cite', 'q', 'a']);
const SVG_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);
const VOID = new Set(['br', 'hr']);
/** Elements dropped with everything inside them. */
const DROPPED = new Set([
  'script',
  'style',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'noscript',
  'noembed',
  'noframes',
  'textarea',
  'title',
  'xmp',
  'plaintext',
  'select',
  'option',
  'button',
  'form',
  'math',
  'foreignobject',
  'video',
  'audio',
  'canvas',
  'picture',
  'head',
  'defs',
  'symbol',
  'pattern',
  'mask',
  'clippath',
  'filter',
  'lineargradient',
  'radialgradient',
  'text',
  'textpath',
  'desc',
  'metadata',
]);
/** Elements that never hold anything: dropped alone, as they have no end tag to skip to. */
const DROPPED_VOID = new Set([
  'img',
  'input',
  'embed',
  'frame',
  'base',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'area',
  'col',
  'keygen',
  'wbr',
  'image',
  'use',
]);
/** Elements whose contents the browser reads as raw text, up to their end tag. */
const RAW_TEXT = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
]);
const SVG_ATTRIBUTES = new Map(
  [
    'viewBox',
    'width',
    'height',
    'x',
    'y',
    'x1',
    'y1',
    'x2',
    'y2',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'd',
    'points',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
    'stroke-dashoffset',
    'opacity',
    'fill-opacity',
    'stroke-opacity',
    'fill-rule',
    'transform',
    'preserveAspectRatio',
  ].map((a) => [a.toLowerCase(), a]),
);
const SVG_VALUE = /^[-+0-9a-zA-Z.,#%()\s]{0,4000}$/;
const CLASS = /^[A-Za-z_][A-Za-z0-9_-]{0,40}$/;
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  middot: '·',
  hellip: '…',
  times: '×',
  bull: '•',
  rarr: '→',
  larr: '←',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  copy: '©',
  reg: '®',
  trade: '™',
};
const decode = (text: string) =>
  text.replace(
    /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi,
    (all, ref: string) => {
      const code =
        ref[0] === '#'
          ? ref[1] === 'x' || ref[1] === 'X'
            ? parseInt(ref.slice(2), 16)
            : Number(ref.slice(1))
          : NaN;
      if (ref[0] === '#')
        return code > 0 &&
          code <= 0x10ffff &&
          !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : '';
      return NAMED[ref.toLowerCase()] ?? all;
    },
  );
const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (text: string) =>
  escapeText(text).replace(/"/g, '&quot;');

type Node =
  | { kind: 'text'; text: string }
  | {
      kind: 'element';
      name: string;
      svg: boolean;
      attributes: [string, string][];
      children: Node[];
    };

/** Reads a start tag at `at` (a `<` followed by a letter): its name, attributes and where it ends. */
function startTag(
  html: string,
  at: number,
): {
  name: string;
  attributes: [string, string][];
  end: number;
  closed: boolean;
} | null {
  const m = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(at, at + 64));
  if (!m) return null;
  const attributes: [string, string][] = [];
  let i = at + m[0].length;
  while (i < html.length) {
    while (i < html.length && /[\s/]/.test(html[i])) i++;
    if (html[i] === '>') {
      return {
        name: m[1].toLowerCase(),
        attributes,
        end: i + 1,
        closed: html[i - 1] === '/',
      };
    }
    const name = /^[^\s"'>/=]+/.exec(html.slice(i, i + 200));
    if (!name) {
      i++;
      continue;
    }
    i += name[0].length;
    while (i < html.length && /\s/.test(html[i])) i++;
    let value = '';
    if (html[i] === '=') {
      i++;
      while (i < html.length && /\s/.test(html[i])) i++;
      const q = html[i];
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, i + 1);
        if (close < 0) return null;
        value = html.slice(i + 1, close);
        i = close + 1;
      } else {
        const bare = /^[^\s>]*/.exec(html.slice(i))![0];
        value = bare;
        i += bare.length;
      }
    }
    attributes.push([name[0].toLowerCase(), decode(value)]);
  }
  return null;
}

/** The markup read into a tree of allowed elements; anything else goes, with its contents where it could hold script. */
function parse(html: string): Node[] {
  const root: Node[] = [];
  const stack: Extract<Node, { kind: 'element' }>[] = [];
  const children = () =>
    stack.length ? stack[stack.length - 1].children : root;
  let skipping: { name: string; depth: number } | null = null;
  let count = 0;
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const close = html.indexOf('-->', i + 4);
      i = close < 0 ? html.length : close + 3;
      continue;
    }
    if (html[i] !== '<') {
      const next = html.indexOf('<', i);
      const text = html.slice(i, next < 0 ? html.length : next);
      // Space between elements stays one space, so inline elements keep it.
      if (!skipping)
        children().push({
          kind: 'text',
          text: text.trim() ? decode(text).slice(0, 400) : ' ',
        });
      i = next < 0 ? html.length : next;
      continue;
    }
    if (html[i + 1] === '/') {
      const m = /^<\/\s*([a-zA-Z][a-zA-Z0-9:-]*)[^>]*>/.exec(
        html.slice(i, i + 80),
      );
      if (!m) {
        i++;
        continue;
      }
      const name = m[1].toLowerCase();
      i += m[0].length;
      if (skipping) {
        if (name === skipping.name && --skipping.depth === 0) skipping = null;
        continue;
      }
      const at = stack
        .map((e) => e.name)
        .lastIndexOf(
          AS_DIV.has(name) ? 'div' : AS_SPAN.has(name) ? 'span' : name,
        );
      if (at >= 0) stack.length = at;
      continue;
    }
    if (!/[a-zA-Z]/.test(html[i + 1] || '')) {
      // `<!doctype`, `<?xml` and the like go; a lone `<` is text.
      const close = html.indexOf('>', i);
      if (/[!?]/.test(html[i + 1] || ''))
        i = close < 0 ? html.length : close + 1;
      else {
        if (!skipping) children().push({ kind: 'text', text: '<' });
        i++;
      }
      continue;
    }
    const tag = startTag(html, i);
    if (!tag) break;
    i = tag.end;
    if (RAW_TEXT.has(tag.name)) {
      const close = html.toLowerCase().indexOf(`</${tag.name}`, i);
      i = close < 0 ? html.length : html.indexOf('>', close) + 1 || html.length;
      continue;
    }
    if (skipping) {
      if (tag.name === skipping.name && !tag.closed) skipping.depth++;
      continue;
    }
    if (DROPPED_VOID.has(tag.name)) continue;
    if (DROPPED.has(tag.name)) {
      if (!tag.closed) skipping = { name: tag.name, depth: 1 };
      continue;
    }
    const inSvg = stack.some((e) => e.svg);
    const name = AS_DIV.has(tag.name)
      ? 'div'
      : AS_SPAN.has(tag.name)
        ? 'span'
        : tag.name;
    const allowed = inSvg
      ? SVG_ELEMENTS.has(name) && name !== 'svg'
      : HTML_ELEMENTS.has(name) || name === 'svg';
    if (!allowed || ++count > 400 || stack.length >= 30) continue;
    const element: Extract<Node, { kind: 'element' }> = {
      kind: 'element',
      name,
      svg: SVG_ELEMENTS.has(name),
      attributes: tag.attributes,
      children: [],
    };
    children().push(element);
    if (!VOID.has(name) && !tag.closed) stack.push(element);
  }
  return root;
}

/** An element's attributes, cleaned, as names and values; a slot already taken in the layout goes. */
function cleanAttributes(
  element: Extract<Node, { kind: 'element' }>,
  slots: Set<DesignSlot>,
): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  for (const [name, value] of element.attributes) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (name === 'class') {
      const classes = value
        .split(/\s+/)
        .filter((c) => CLASS.test(c))
        .slice(0, 8);
      if (classes.length) out.push(['class', classes.join(' ')]);
    } else if (name === 'style') {
      const style = cleanDeclarations(value);
      if (style) out.push(['style', style]);
    } else if (name === 'data-slot' && !element.svg) {
      const slot = value.trim() as DesignSlot;
      if (DESIGN_SLOTS.includes(slot) && !slots.has(slot)) {
        slots.add(slot);
        out.push(['data-slot', slot]);
      }
    } else if (name === 'aria-hidden') out.push(['aria-hidden', 'true']);
    else if (element.svg && SVG_ATTRIBUTES.has(name)) {
      const v = value.trim();
      if (SVG_VALUE.test(v) && !/url\s*\(|javascript|expression/i.test(v))
        out.push([SVG_ATTRIBUTES.get(name)!, v]);
    }
  }
  return out;
}

function write(nodes: Node[], slots: Set<DesignSlot>): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text') return escapeText(node.text);
      const pairs = cleanAttributes(node, slots);
      const attributes = pairs
        .map(([k, v]) => ` ${k}="${escapeAttribute(v)}"`)
        .join('');
      if (VOID.has(node.name)) return `<${node.name}${attributes}>`;
      // A slot's own contents are the model's sample text; the template fills it.
      const inner = pairs.some(([k]) => k === 'data-slot')
        ? ''
        : write(node.children, slots);
      return `<${node.name}${attributes}>${inner}</${node.name}>`;
    })
    .join('');
}

/**
 * A layout as the card template builds it: text, or an element as its name, attributes and children. The template
 * creates each element itself (createElement, setAttribute, textContent) and never parses markup.
 */
export type DesignNode =
  string | [string, Record<string, string>, DesignNode[]];

function tree(nodes: Node[], slots: Set<DesignSlot>): DesignNode[] {
  return nodes.map((node): DesignNode => {
    if (node.kind === 'text') return node.text;
    const pairs = cleanAttributes(node, slots);
    const slotted = pairs.some(([k]) => k === 'data-slot');
    return [
      node.name,
      Object.fromEntries(pairs),
      VOID.has(node.name) || slotted ? [] : tree(node.children, slots),
    ];
  });
}

/** A layout's markup, cleaned, as the tree the card template builds. */
export function markupTree(html: string): DesignNode[] {
  return tree(parse(String(html || '')), new Set());
}

/** A layout's markup, cleaned and written out again, with the slots it has. */
export function cleanMarkup(html: string): {
  html: string;
  slots: DesignSlot[];
} {
  const slots = new Set<DesignSlot>();
  const out = write(parse(String(html || '')), slots);
  return { html: out, slots: [...slots] };
}

// ---------------------------------------------------------------------------------------------------------------------
// A whole style

export type DesignProblem =
  | { kind: 'missing'; layout: DesignLayout; slot: DesignSlot }
  | { kind: 'tooLong'; part: 'css' | DesignLayout };

/**
 * A style as the model or a request gave it, cleaned, and what keeps it from being used: a layout without its heading
 * or body, or a part longer than its limit. A value that is not a string is empty.
 */
export function cleanDesign(input: unknown): {
  design: CardDesign;
  problems: DesignProblem[];
} {
  const value = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >;
  const text = (key: string) =>
    typeof value[key] === 'string' ? value[key] : '';
  const problems: DesignProblem[] = [];
  const rawCss = text('css');
  if (rawCss.length > DESIGN_CSS_MAX * 2)
    problems.push({ kind: 'tooLong', part: 'css' });
  const css = cleanCss(rawCss.slice(0, DESIGN_CSS_MAX * 2));
  if (css.length > DESIGN_CSS_MAX && !problems.length)
    problems.push({ kind: 'tooLong', part: 'css' });
  const layouts = {} as Record<DesignLayout, string>;
  for (const layout of DESIGN_LAYOUTS) {
    const raw = text(layout);
    const { html, slots } = cleanMarkup(raw.slice(0, DESIGN_MARKUP_MAX * 2));
    if (raw.length > DESIGN_MARKUP_MAX * 2 || html.length > DESIGN_MARKUP_MAX)
      problems.push({ kind: 'tooLong', part: layout });
    for (const slot of REQUIRED_SLOTS)
      if (!slots.includes(slot))
        problems.push({ kind: 'missing', layout, slot });
    layouts[layout] = html.slice(0, DESIGN_MARKUP_MAX);
  }
  return {
    design: { css: css.slice(0, DESIGN_CSS_MAX), ...layouts },
    problems,
  };
}

/** A style saved to My styles (`card-styles:<projectId>`). */
export type SavedStyle = {
  id: string;
  name: string;
  /** What the model said the style is, in a line. */
  summary: string;
  design: CardDesign;
  savedAt: string;
  savedBy: { id: string; name: string };
};
/** How the brand kit names a saved style as its card style. */
export const savedStyleRef = (id: string): `mine:${string}` => `mine:${id}`;
export const savedStyleId = (ref: unknown): string | null =>
  typeof ref === 'string' && /^mine:[a-z0-9-]{1,40}$/.test(ref)
    ? ref.slice(5)
    : null;
