import { XHS } from './repurpose.js';

/**
 * The Xiaohongshu card templates (2026-11-16, Content workshop PR 2; four card styles 2026-11-17). One HTML page, built
 * here from the brand kit and given to the Agent with its run's materials (`xhs-card.html`): the Agent writes its cards
 * to `cards.js` beside it (`window.CARDS = [{ layout, heading, text }]`), opens `xhs-card.html?n=3` in a headless
 * browser at 1080×1440 and saves a PNG of each card. Text is set as text, never as HTML.
 *
 * Each style sizes its text to the card: the heading and the body take the largest size of their steps that fits, so a
 * short card is set large and a long one smaller, and the text fills the card rather than its top. Once fonts have
 * loaded and the text is sized, the page lists the cards whose text still does not fit on `<body data-overflow>` and in
 * its title (`overflow:none`, `overflow:3,7`), which is how the Agent reports overflow.
 *
 * The same page re-renders a set in the browser when a reviewer edits its text (Edit directly, client/lib/card-render.ts):
 * framed, it posts the overflow to its parent, and with `window.CARD_EXPORT` set each card as a self-contained SVG the
 * parent draws to a PNG. The demo's card images are rendered from the same page (scripts/render-demo-cards.ts).
 */

/** The card styles NocoReach has built in; the brand kit picks one, Editorial when it has not. */
export const CARD_TEMPLATES = [
  'editorial',
  'memo',
  'dark',
  'checklist',
] as const;
export type CardTemplateId = (typeof CARD_TEMPLATES)[number];
export const DEFAULT_TEMPLATE: CardTemplateId = 'editorial';
export const isCardTemplate = (value: unknown): value is CardTemplateId =>
  CARD_TEMPLATES.includes(value as CardTemplateId);

/** The brand color every style draws its accents with, unless the brand kit has one. */
export const CARD_COLOR = '#1e3a8a';
export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
/** A logo kept in the brand kit: a PNG, JPEG or WebP data URL of at most this many bytes. */
export const LOGO_BYTES = 200 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ENDING_HEADING_MAX = 40;
export const ENDING_TEXT_MAX = 60;

/** The brand kit's card settings (`brand-kit:{project}` `.cards`); a missing value is its default. */
export type BrandCards = {
  /** The card style. */
  template?: CardTemplateId;
  /** A logo uploaded to the brand kit; none is the website's icon. */
  logo?: string | null;
  /** The brand color. */
  color?: string;
  /** The closing page every set ends with, when there is one. */
  ending?: { heading: string; text: string } | null;
};

/** Everything a card is drawn with: the brand kit's settings with their defaults, and the project's name and site. */
export type CardStyle = {
  template: CardTemplateId;
  color: string;
  brand: string;
  site?: string;
  logo?: string;
  ending?: { heading: string; text: string } | null;
};

/** A data URL the template may draw as the logo: an image type a browser shows in `<img>`, base64 encoded. */
const LOGO_URL =
  /^data:image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/;

export function cardStyle(
  cards: BrandCards | null | undefined,
  project: { name?: string; site?: string; icon?: string | null },
): CardStyle {
  const logo = cards?.logo || project.icon || undefined;
  return {
    template: isCardTemplate(cards?.template)
      ? cards.template
      : DEFAULT_TEMPLATE,
    color: isHexColor(cards?.color) ? cards.color.toLowerCase() : CARD_COLOR,
    brand: String(project.name || '').slice(0, 60),
    ...(project.site ? { site: project.site.slice(0, 100) } : {}),
    ...(logo && LOGO_URL.test(logo) ? { logo } : {}),
    ending: cards?.ending?.heading ? cards.ending : null,
  };
}

/** What the Agent is told of the style, without the logo's bytes, which only the template carries. */
export type CardStyleBrief = Omit<CardStyle, 'logo'> & { logo: boolean };
export const styleBrief = ({ logo, ...style }: CardStyle): CardStyleBrief => ({
  ...style,
  logo: Boolean(logo),
});

/**
 * The style a set is drawn in again (Edit directly): the one its images were drawn in, with the logo it had, which is
 * the brand kit's now; a set without one is drawn in the brand kit's current style.
 */
export function styleOf(
  brief: CardStyleBrief | undefined,
  current: CardStyle,
): CardStyle {
  if (!brief || !isCardTemplate(brief.template)) return current;
  const { logo, ...rest } = brief;
  return {
    ...rest,
    color: isHexColor(rest.color) ? rest.color : current.color,
    ...(logo && current.logo ? { logo: current.logo } : {}),
  };
}

/** The card set in `cards.js`, as the template reads it. */
export type TemplateCard = {
  layout: 'cover' | 'text' | 'end';
  heading?: string;
  text: string;
};

/** What a framed template page posts to its parent once its cards are drawn. */
export type CardMessage = {
  source: 'nocoreach-xhs-card';
  overflow: number[];
  /** With `window.CARD_EXPORT`: each card drawn as a self-contained SVG of the card size. */
  cards?: { n: number; svg: string }[];
  /** The browser never laid the cards out, so their text was not sized; `overflow` then lists every card. */
  unmeasured?: true;
};
export const CARD_MESSAGE = 'nocoreach-xhs-card';

// The page's own script, in plain browser JavaScript. `S` is the style and `XHS` the card size. Every element is styled
// inline, without a stylesheet or pseudo-elements, so a card serialized on its own (CARD_EXPORT) draws the same.
const SCRIPT = String.raw`
const SANS = "'PingFang SC','Hiragino Sans GB','Noto Sans CJK SC','Source Han Sans SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif";
const SERIF = "'Songti SC','Noto Serif CJK SC','Source Han Serif SC','STSong','SimSun',Georgia,'Times New Roman',serif";
const el = (tag, css, text) => {
  const e = document.createElement(tag);
  e.style.cssText = css || '';
  if (text != null) e.textContent = text;
  return e;
};
const add = (parent, ...kids) => {
  for (const k of kids) if (k) parent.appendChild(k);
  return parent;
};
const paras = (t) => String(t || '').split('\n').map((s) => s.trim()).filter(Boolean);
// A line in brackets is a note ("(A fictional comparison.)"), set smaller.
const isNote = (s) => /^[（(][\s\S]*[)）]$/.test(s);
// A card's text as its points: a line ending at a comma goes on in the next line, so a sentence broken across lines
// stays one point rather than becoming two items of a list.
const points = (t) => paras(t).reduce((out, p) => {
  const last = out[out.length - 1];
  if (last && !isNote(last) && !isNote(p) && /[，,、]$/.test(last)) out[out.length - 1] = last + (last.endsWith(',') ? ' ' : '') + p;
  else out.push(p);
  return out;
}, []);
// The styles that mark points draw their own markers, so they drop the ones the text brings ("- ", "1. ", "①"), and mark
// points only when there are two or more: a single point is a paragraph.
const unmarked = (p) => p.replace(/^(?:[-•·*]\s+|\d{1,2}[.)]\s+|\d{1,2}、\s*|[①-⑳]\s*)/, '');
const listed = (pts) => pts.filter((p) => !isNote(p)).length > 1;
// A heading's two parts at its first colon or comma, for the styles that set the second in the brand color.
const halves = (h) => {
  const t = String(h || '').trim(), m = /^(.{2,}?)\s*[：:，,]\s*(.{2,})$/.exec(t);
  return m ? [m[1], m[2]] : [t, ''];
};
const two = (n) => String(n).padStart(2, '0');
const pageOf = (n, total) => two(n) + ' / ' + two(total);

// Colors: the brand color in HSL, made darker for text on a light card and lighter on a dark one, so any brand color reads.
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
function hslOf(hex) {
  const [r, g, b] = rgbOf(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hex(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [0, 8, 4].map((n) => f(n).toString(16).padStart(2, '0')).join('');
}
const [H0, S0, L0] = hslOf(S.color);
const DEEP = hex(H0, S0, Math.min(L0, 0.42));
const mix = (a, b, t) => {
  const x = rgbOf(a), y = rgbOf(b);
  return '#' + x.map((v, i) => Math.round(255 * (v + (y[i] - v) * t)).toString(16).padStart(2, '0')).join('');
};
const alpha = (c, a) => {
  const [r, g, b] = rgbOf(c);
  return 'rgba(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ',' + a + ')';
};

// The logo, or the brand's first letter, in a rounded square.
const mark = (size, fg, bg) => {
  const box = el('div', 'width:' + size + 'px;height:' + size + 'px;border-radius:' + size * 0.24 + 'px;background:' + bg + ';display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none;color:' + fg + ';font-weight:700;font-size:' + size * 0.56 + 'px;line-height:1');
  if (S.logo) {
    const img = el('img', 'width:80%;height:80%;object-fit:contain;display:block');
    img.src = S.logo;
    box.appendChild(img);
  } else box.textContent = (S.brand || '·').trim().charAt(0).toUpperCase();
  return box;
};

// Text sizing: each job tries its sizes, largest first, and keeps the first that fits. Jobs run in order once fonts
// have loaded, the heading's before the body's that fills what the heading leaves. Text wraps with text-wrap: pretty;
// where a line of one or two characters is still left alone at the end (an orphan), a heading keeps its size and wraps
// up to three characters earlier, and a body takes one or two sizes smaller, when that fits without one.
const jobs = [];
const fitBox = (box) => () => box.scrollHeight <= box.clientHeight + 1;
const fitLines = (node, lines, lh) => () => node.offsetHeight <= lines * lh * parseFloat(node.style.fontSize) + 2;
// A body's size stays below its heading's (cap), so the heading still leads however short the body.
const sized = (node, sizes, ok, cap, tidy) => jobs.push({ node, sizes, apply: (s) => (node.style.fontSize = s + 'px'), ok, cap, tidy });
const headed = (node, sizes, lh) => sized(node, sizes, fitLines(node, 3, lh), null, 'narrow');
const filled = (node, cap) => sized(node, BODY, fitBox(node), cap, 'smaller');
// Whether a text in the box ends on a line of one or two characters (an orphan, as "期，" alone under a long line):
// the last line of a text that wraps, narrower than about two and a half of its characters.
const orphaned = (box) => [...box.querySelectorAll('*')].some((e) => {
  const text = [...e.childNodes].find((x) => x.nodeType === 3 && x.data.trim());
  if (!text) return false;
  const range = document.createRange();
  range.selectNodeContents(text);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0);
  const last = Math.max(...rects.map((r) => Math.round(r.top)));
  if (new Set(rects.map((r) => Math.round(r.top))).size < 2) return false;
  const width = rects.filter((r) => Math.round(r.top) === last).reduce((sum, r) => sum + r.width, 0);
  return width < 2.6 * parseFloat(getComputedStyle(e).fontSize);
});
const under = (node, ratio) => () => parseFloat(node.style.fontSize) * ratio;
const BODY = [96, 92, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40, 36];
const HEAD = [124, 116, 108, 100, 92, 84, 76, 68];
// A list that drops its last items while it does not fit at its smallest size (a cover's contents).
// It keeps at least four at a larger size before going smaller, so a long set's cover lists fewer items, not tiny ones.
const shrinking = (box, list, sizes) => jobs.push({ sizes, apply: (s) => (list.style.fontSize = s + 'px'), ok: fitBox(box), drop: list, items: [...list.children] });
// A box the body fills, whose text is the card's own: still overflowing at its smallest size, the card is reported.
const area = (css) => {
  const box = el('div', 'flex:1 1 0;min-height:0;overflow:hidden;display:flex;flex-direction:column;' + (css || ''));
  box.dataset.fit = '';
  return box;
};
// A heading in its two parts, the second set apart by the style.
const heading = (h, css, second) => {
  const [a, b] = halves(h), node = el('div', css);
  add(node, el('span', '', a));
  if (b) add(node, el('br'), second(b));
  return node;
};

const contents = (all) => all.filter((c) => c.layout === 'text' && (c.heading || c.text)).map((c) => c.heading || paras(c.text)[0] || '');

const LOOKS = {
  // Editorial: a cream page, a black masthead rule, a serif headline whose second line is in the brand color.
  editorial(c, n, total, all) {
    const ink = '#1b1a17', bg = '#f4eee2', accent = DEEP;
    const root = el('div', 'background:' + bg + ';color:' + ink + ';padding:92px 88px 0;display:flex;flex-direction:column');
    const head = el('div', 'flex:none;display:flex;justify-content:space-between;align-items:flex-end;font-family:' + SANS + ';font-size:30px;font-weight:600;letter-spacing:4px;padding-bottom:24px;border-bottom:5px solid ' + ink);
    add(head, el('span', 'text-transform:uppercase', S.brand), el('span', '', pageOf(n, total)));
    const foot = el('div', 'flex:none;height:150px;box-sizing:border-box;border-top:2px solid ' + ink + ';display:flex;justify-content:space-between;align-items:center;font-family:' + SANS + ';font-size:28px;letter-spacing:1px;color:' + alpha(ink, 0.7));
    add(foot, el('span', '', S.site || S.brand), mark(44, bg, accent));
    const second = (b) => el('span', 'color:' + accent, b);
    if (c.layout === 'cover') {
      const top = area('padding-top:110px');
      const h = heading(c.heading || paras(c.text)[0], 'font-family:' + SERIF + ';font-weight:800;line-height:1.22;letter-spacing:1px;white-space:pre-wrap', second);
      const sub = el('div', 'font-family:' + SANS + ';line-height:1.6;margin-top:44px;color:' + alpha(ink, 0.78) + ';white-space:pre-wrap', c.heading ? c.text : paras(c.text).slice(1).join('\n'));
      add(top, h, sub);
      top.style.flex = 'none';
      top.style.maxHeight = '820px';
      const box = el('div', 'flex:1 1 0;min-height:0;overflow:hidden;padding:64px 0 32px');
      const list = el('div', 'font-family:' + SANS);
      contents(all).forEach((t, i) => {
        const row = el('div', 'display:flex;gap:.8em;align-items:baseline;padding:.5em 0;border-top:2px solid ' + alpha(ink, 0.18));
        add(row, el('span', 'flex:none;color:' + accent + ';font-weight:700;letter-spacing:1px', two(i + 2)), el('span', 'font-weight:500', t));
        list.appendChild(row);
      });
      add(box, list);
      headed(h, [140, 128, 116, 104, 96, 88], 1.22);
      sized(sub, [52, 48, 44, 40], fitBox(top));
      shrinking(box, list, [52, 48, 44, 40]);
      return add(root, head, top, box, foot);
    }
    if (c.layout === 'end') {
      const body = area('justify-content:center;gap:44px');
      const h = el('div', 'font-family:' + SERIF + ';font-weight:800;line-height:1.3;white-space:pre-wrap', c.heading || '');
      const t = el('div', 'font-family:' + SANS + ';color:' + accent + ';line-height:1.5;white-space:pre-wrap', c.text);
      add(body, mark(132, bg, accent), h, t);
      sized(h, [96, 88, 80, 72, 64], fitBox(body), null, 'narrow');
      sized(t, [52, 48, 44, 40], fitBox(body));
      return add(root, head, body, foot);
    }
    const no = el('div', 'flex:none;margin-top:56px;font-family:' + SERIF + ';font-size:44px;font-weight:700;color:' + accent + ';letter-spacing:2px', 'No.' + two(n));
    const h = heading(c.heading, 'flex:none;margin-top:24px;font-family:' + SERIF + ';font-weight:800;line-height:1.25;white-space:pre-wrap', second);
    const rule = el('div', 'flex:none;width:120px;height:8px;background:' + accent + ';margin-top:48px');
    const body = area('padding:52px 0 40px;font-family:' + SANS);
    const inner = el('div', 'margin:auto 0');
    for (const p of points(c.text)) add(inner, el('div', isNote(p) ? 'font-size:.62em;line-height:1.6;color:' + alpha(ink, 0.55) + ';margin-top:.5em' : 'line-height:1.66;margin-bottom:.6em', p));
    add(body, inner);
    if (c.heading) headed(h, HEAD, 1.25);
    filled(body, c.heading ? under(h, 0.76) : null);
    return add(root, head, no, c.heading ? h : null, rule, body, foot);
  },

  // Notes: an iOS Notes page in the brand color, a highlighted heading and a check before every point.
  memo(c, n, total, all) {
    const ink = '#1c1c1e', bg = '#ffffff', accent = DEEP, tint = mix(accent, bg, 0.72);
    const root = el('div', 'background:' + bg + ';color:' + ink + ';padding:0 84px;display:flex;flex-direction:column;font-family:' + SANS);
    const ring = (w, h, r) => el('i', 'display:block;box-sizing:border-box;width:' + w + 'px;height:' + h + 'px;border:5px solid ' + accent + ';border-radius:' + r);
    const bar = el('div', 'flex:none;height:150px;display:flex;justify-content:space-between;align-items:center;color:' + accent + ';font-size:44px;font-weight:500');
    add(bar, el('span', '', '‹ ' + S.brand), add(el('span', 'display:flex;gap:40px;align-items:center'), ring(44, 52, '10px'), ring(52, 52, '50%')));
    const date = el('div', 'flex:none;text-align:center;font-size:30px;color:' + alpha(ink, 0.45) + ';margin-bottom:36px', pageOf(n, total));
    const tool = el('div', 'flex:none;height:150px;display:flex;justify-content:space-between;align-items:center;padding:0 12px');
    add(tool, ring(52, 52, '50%'), ring(56, 48, '12px'), ring(52, 52, '14px'));
    const marker = (b) => el('span', 'background:linear-gradient(transparent 58%,' + tint + ' 58%,' + tint + ' 94%,transparent 94%);-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:0 .08em', b);
    // A filled circle with a check drawn by two borders, sized by its text.
    const check = () => {
      const dot = el('span', 'flex:none;width:1.04em;height:1.04em;margin-top:.3em;border-radius:50%;background:' + accent + ';display:flex;align-items:center;justify-content:center');
      dot.appendChild(el('i', 'display:block;width:.24em;height:.46em;margin-top:-.1em;border:solid ' + bg + ';border-width:0 .1em .1em 0;transform:rotate(45deg)'));
      return dot;
    };
    const line = (p, css) => add(el('div', 'display:flex;gap:.5em;' + css), check(), el('span', 'min-width:0', p));
    if (c.layout === 'cover') {
      const top = el('div', 'flex:none;max-height:820px;overflow:hidden');
      top.dataset.fit = '';
      const h = heading(c.heading || paras(c.text)[0], 'font-weight:800;line-height:1.24;letter-spacing:1px;white-space:pre-wrap', marker);
      const sub = el('div', 'line-height:1.6;margin-top:40px;color:' + alpha(ink, 0.72) + ';white-space:pre-wrap', c.heading ? c.text : paras(c.text).slice(1).join('\n'));
      add(top, h, sub);
      const box = el('div', 'flex:1 1 0;min-height:0;overflow:hidden;padding:64px 0 24px');
      const list = el('div', 'font-weight:600');
      for (const t of contents(all)) list.appendChild(line(t, 'margin-bottom:.7em;line-height:1.5'));
      add(box, list);
      headed(h, [132, 120, 108, 96, 88], 1.24);
      sized(sub, [54, 50, 46, 42], fitBox(top));
      shrinking(box, list, [56, 52, 48, 44, 40]);
      return add(root, bar, date, top, box, tool);
    }
    if (c.layout === 'end') {
      const body = area('justify-content:center;align-items:center;text-align:center;gap:44px');
      const h = el('div', 'font-weight:800;line-height:1.32;white-space:pre-wrap', c.heading || '');
      const t = el('div', 'color:' + accent + ';line-height:1.5;white-space:pre-wrap', c.text);
      add(body, mark(132, bg, accent), h, t);
      sized(h, [88, 80, 72, 64], fitBox(body), null, 'narrow');
      sized(t, [52, 48, 44, 40], fitBox(body));
      return add(root, bar, body, tool);
    }
    const h = heading(c.heading, 'flex:none;font-weight:800;line-height:1.3;white-space:pre-wrap', marker);
    const body = area('padding:56px 0 32px');
    const inner = el('div', 'margin:auto 0');
    const pts = points(c.text), list = listed(pts);
    for (const p of pts)
      add(inner, isNote(p) ? el('div', 'font-size:.62em;line-height:1.6;color:' + alpha(ink, 0.5) + ';margin-top:.2em' + (list ? ';padding-left:1.6em' : ''), p)
        : list ? line(unmarked(p), 'line-height:1.62;margin-bottom:.6em') : el('div', 'line-height:1.62;margin-bottom:.6em', unmarked(p)));
    add(body, inner);
    if (c.heading) headed(h, HEAD, 1.3);
    filled(body, c.heading ? under(h, 0.76) : null);
    return add(root, bar, date, c.heading ? h : null, body, tool);
  },

  // Dark tech: a near-black page in the brand's hue, a lighter brand color for keywords, a panel for every point.
  dark(c, n, total, all) {
    const bg = hex(H0, Math.min(S0, 0.42), 0.085), fg = '#ffffff', accent = hex(H0, Math.max(S0, 0.7) * (S0 > 0.08 ? 1 : 0), 0.74);
    const root = el('div', 'background:' + bg + ';color:' + fg + ';padding:96px 84px 0;display:flex;flex-direction:column;font-family:' + SANS);
    const pill = (t) => el('div', 'flex:none;align-self:flex-start;font-size:30px;font-weight:600;letter-spacing:1px;padding:12px 28px;border-radius:999px;color:' + accent + ';background:' + alpha(accent, 0.16), t);
    const foot = el('div', 'flex:none;height:150px;box-sizing:border-box;border-top:2px solid ' + alpha(fg, 0.14) + ';display:flex;justify-content:space-between;align-items:center;font-size:30px;color:' + alpha(fg, 0.55));
    add(foot, add(el('span', 'display:flex;gap:18px;align-items:center'), mark(44, bg, accent), el('span', '', S.site || S.brand)), el('span', 'letter-spacing:2px', pageOf(n, total)));
    const second = (b) => el('span', 'color:' + accent, b);
    const panel = 'border-radius:28px;background:' + alpha(fg, 0.07) + ';border:2px solid ' + alpha(fg, 0.14);
    if (c.layout === 'cover') {
      const top = el('div', 'flex:none;max-height:820px;overflow:hidden;padding-top:96px');
      top.dataset.fit = '';
      const h = heading(c.heading || paras(c.text)[0], 'font-weight:800;line-height:1.18;letter-spacing:1px;white-space:pre-wrap', second);
      const sub = el('div', 'line-height:1.6;margin-top:44px;color:' + alpha(fg, 0.7) + ';white-space:pre-wrap', c.heading ? c.text : paras(c.text).slice(1).join('\n'));
      add(top, h, sub);
      const box = el('div', 'flex:1 1 0;min-height:0;overflow:hidden;padding:72px 0 32px');
      const list = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:24px;align-content:start');
      contents(all).forEach((t, i) => list.appendChild(add(el('div', panel + ';padding:.8em .85em;line-height:1.45'), el('div', 'color:' + accent + ';font-weight:800;font-size:.8em;margin-bottom:.3em', two(i + 2)), el('div', 'font-weight:600', t))));
      add(box, list);
      headed(h, [136, 124, 112, 100, 92], 1.18);
      sized(sub, [54, 50, 46, 42], fitBox(top));
      shrinking(box, list, [48, 44, 40]);
      return add(root, pill(S.brand), top, box, foot);
    }
    if (c.layout === 'end') {
      const body = area('justify-content:center;align-items:center;text-align:center;gap:44px');
      const h = el('div', 'font-weight:800;line-height:1.3;white-space:pre-wrap', c.heading || '');
      const t = el('div', 'color:' + accent + ';line-height:1.5;white-space:pre-wrap', c.text);
      add(body, mark(140, bg, accent), h, t);
      sized(h, [88, 80, 72, 64], fitBox(body), null, 'narrow');
      sized(t, [52, 48, 44, 40], fitBox(body));
      return add(root, body, foot);
    }
    const h = heading(c.heading, 'flex:none;margin-top:60px;font-weight:800;line-height:1.24;white-space:pre-wrap', second);
    const body = area('padding:56px 0 36px');
    // The panels share the height the heading leaves, their text in their middle; a single point is a paragraph.
    const pts = points(c.text), list = listed(pts);
    const inner = el('div', list ? 'flex:1 0 auto;display:flex;flex-direction:column;gap:.4em' : 'margin:auto 0');
    let k = 0;
    for (const p of pts)
      add(inner, isNote(p) ? el('div', 'flex:none;font-size:.62em;line-height:1.6;color:' + alpha(fg, 0.5), p)
        : list ? add(el('div', panel + ';flex:1 0 auto;display:flex;flex-direction:column;justify-content:center;padding:.6em .8em;line-height:1.56;color:' + alpha(fg, 0.92)), add(el('div', 'display:flex;gap:.6em'), el('span', 'flex:none;color:' + accent + ';font-weight:800', two(++k)), el('span', 'min-width:0', unmarked(p))))
        : el('div', 'line-height:1.6;margin-bottom:.6em;color:' + alpha(fg, 0.92), unmarked(p)));
    add(body, inner);
    if (c.heading) headed(h, HEAD, 1.24);
    filled(body, c.heading ? under(h, 0.72) : null);
    return add(root, pill(pageOf(n, total) + ' · ' + S.brand), c.heading ? h : null, body, foot);
  },

  // Checklist: a white page, a heading whose second part is marked in the brand color, a numbered row for every point.
  checklist(c, n, total, all) {
    const ink = '#111827', bg = '#ffffff', accent = DEEP, tint = mix(accent, bg, 0.86);
    const root = el('div', 'background:' + bg + ';color:' + ink + ';padding:92px 80px 0;display:flex;flex-direction:column;font-family:' + SANS);
    const head = el('div', 'flex:none;display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:700');
    add(head, add(el('span', 'display:flex;gap:16px;align-items:center;color:' + accent), mark(44, bg, accent), el('span', '', S.brand)), el('span', 'color:' + alpha(ink, 0.4) + ';letter-spacing:2px', pageOf(n, total)));
    const foot = el('div', 'flex:none;height:132px;display:flex;align-items:center;font-size:28px;color:' + alpha(ink, 0.45), S.site || S.brand);
    const marked = (b) => el('span', 'color:' + accent + ';background:' + tint + ';border-radius:.14em;padding:0 .14em;-webkit-box-decoration-break:clone;box-decoration-break:clone', b);
    const badge = (t) => el('span', 'flex:none;width:1.5em;height:1.5em;margin-top:.05em;border-radius:.3em;background:' + accent + ';color:' + bg + ';font-weight:800;display:flex;align-items:center;justify-content:center;font-size:.86em;line-height:1', t);
    // A row's number and text together, in the middle of the row's height.
    const row = (num, t, css) => add(el('div', 'display:flex;flex-direction:column;justify-content:center;border-bottom:3px dashed ' + alpha(ink, 0.13) + ';' + css), add(el('div', 'display:flex;gap:.6em;align-items:flex-start'), badge(num), el('span', 'min-width:0', t)));
    if (c.layout === 'cover') {
      const top = el('div', 'flex:none;max-height:820px;overflow:hidden;padding-top:96px');
      top.dataset.fit = '';
      const h = heading(c.heading || paras(c.text)[0], 'font-weight:900;line-height:1.26;white-space:pre-wrap', marked);
      const sub = el('div', 'line-height:1.6;margin-top:40px;color:' + alpha(ink, 0.6) + ';white-space:pre-wrap', c.heading ? c.text : paras(c.text).slice(1).join('\n'));
      add(top, h, sub);
      const box = el('div', 'flex:1 1 0;min-height:0;overflow:hidden;padding:60px 0 24px');
      const list = el('div', 'font-weight:700;border-top:3px solid ' + ink);
      contents(all).forEach((t, i) => list.appendChild(row(String(i + 1), t, 'padding:.55em 0;line-height:1.45')));
      add(box, list);
      headed(h, [132, 120, 108, 96, 88], 1.26);
      sized(sub, [52, 48, 44, 40], fitBox(top));
      shrinking(box, list, [56, 52, 48, 44, 40]);
      return add(root, head, top, box, foot);
    }
    if (c.layout === 'end') {
      const body = area('justify-content:center;align-items:center;text-align:center;gap:44px');
      const h = el('div', 'font-weight:900;line-height:1.32;white-space:pre-wrap', c.heading || '');
      const t = el('div', 'color:' + accent + ';line-height:1.5;white-space:pre-wrap', c.text);
      add(body, mark(132, bg, accent), h, t);
      sized(h, [88, 80, 72, 64], fitBox(body), null, 'narrow');
      sized(t, [52, 48, 44, 40], fitBox(body));
      return add(root, head, body, foot);
    }
    const h = heading(c.heading, 'flex:none;margin-top:72px;font-weight:900;line-height:1.3;white-space:pre-wrap', marked);
    const body = area('padding:48px 0 32px');
    // The rows share the height the heading leaves, each a line of the table; a single point is a paragraph.
    const pts = points(c.text), list = listed(pts);
    const inner = el('div', list ? 'flex:1 0 auto;display:flex;flex-direction:column;border-top:4px solid ' + ink : 'margin:auto 0');
    let k = 0;
    for (const p of pts)
      add(inner, isNote(p) ? el('div', 'flex:none;font-size:.62em;line-height:1.6;color:' + alpha(ink, 0.5) + ';margin-top:.6em', p)
        : list ? row(String(++k), unmarked(p), 'flex:1 0 auto;padding:.5em 0;line-height:1.56') : el('div', 'line-height:1.6;margin-bottom:.6em', unmarked(p)));
    add(body, inner);
    if (c.heading) headed(h, HEAD, 1.3);
    filled(body, c.heading ? under(h, 0.76) : null);
    return add(root, head, c.heading ? h : null, body, foot);
  },
};

function card(c, n, total, all) {
  const root = (LOOKS[S.template] || LOOKS.editorial)(c, n, total, all);
  root.style.cssText = 'width:' + XHS.width + 'px;height:' + XHS.height + 'px;position:relative;overflow:hidden;box-sizing:border-box;line-height:1.5;font-size:40px;text-wrap:pretty;' + root.style.cssText;
  root.dataset.card = String(n);
  return root;
}

const cards = Array.isArray(window.CARDS) ? window.CARDS : [];
const n = Number(window.CARD_N || new URLSearchParams(location.search).get('n')) || 0;
const shown = n ? [n] : cards.map((_, i) => i + 1);
document.body.style.cssText = 'margin:0;' + (n ? '' : 'display:flex;flex-direction:column;gap:24px;background:#e5e7eb');
for (const k of shown) if (cards[k - 1]) document.body.appendChild(card(cards[k - 1], k, cards.length, cards));
const svgOf = (node) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + XHS.width + '" height="' + XHS.height + '"><foreignObject x="0" y="0" width="' + XHS.width + '" height="' + XHS.height + '">' +
  new XMLSerializer().serializeToString(node) + '</foreignObject></svg>';
// A page not laid out yet measures every box as empty, where any text seems to fit: the hidden frame that draws a set in
// the browser sometimes runs before its first layout. Sizing waits until the cards have their size, for a few seconds at
// most; a page still not laid out then reports every card as not fitting rather than size the text blind.
const laidOut = () => [...document.querySelectorAll('[data-card]')].every((c) => c.offsetHeight === XHS.height);
const whenLaidOut = (then, tries = 100) => (laidOut() || !tries ? then(laidOut()) : setTimeout(() => whenLaidOut(then, tries - 1), 50));
const fit = (measured) => {
  if (measured) for (const job of jobs) {
    const most = job.cap ? job.cap() : Infinity, sizes = job.sizes.filter((s) => s <= most);
    if (!sizes.length) sizes.push(job.sizes[job.sizes.length - 1]);
    let fit = -1;
    for (let i = 0; i < sizes.length; i++) {
      job.apply(sizes[i]);
      if (job.drop) {
        job.drop.replaceChildren(...job.items);
        const keep = i === sizes.length - 1 ? 1 : Math.min(4, job.items.length);
        while (job.drop.children.length > keep && !job.ok()) job.drop.lastChild.remove();
      }
      if (job.ok()) {
        fit = i;
        break;
      }
    }
    if (fit < 0 || !job.tidy || !orphaned(job.node)) continue;
    let tidied = false;
    if (job.tidy === 'narrow') {
      const width = job.node.clientWidth, size = parseFloat(job.node.style.fontSize);
      for (let k = 1; k <= 3 && !tidied; k++) {
        job.node.style.maxWidth = width - k * size + 'px';
        tidied = job.ok() && !orphaned(job.node);
      }
      if (!tidied) job.node.style.maxWidth = '';
      continue;
    }
    for (let i = fit + 1; i <= Math.min(sizes.length - 1, fit + 2) && !tidied; i++) {
      job.apply(sizes[i]);
      tidied = job.ok() && !orphaned(job.node);
    }
    if (!tidied) job.apply(sizes[fit]);
  }
  const over = [...document.querySelectorAll('[data-card]')]
    .filter((c) => !measured || [...c.querySelectorAll('[data-fit]')].some((f) => f.scrollHeight > f.clientHeight + 1))
    .map((c) => Number(c.dataset.card));
  document.body.dataset.overflow = over.join(',');
  document.title = 'overflow:' + (over.join(',') || 'none');
  if (window.parent !== window)
    window.parent.postMessage({
      source: 'nocoreach-xhs-card',
      overflow: over,
      ...(measured ? {} : { unmeasured: true }),
      ...(window.CARD_EXPORT ? { cards: [...document.querySelectorAll('[data-card]')].map((c) => ({ n: Number(c.dataset.card), svg: svgOf(c) })) } : {}),
    }, '*');
};
document.fonts.ready.then(() => requestAnimationFrame(() => whenLaidOut(fit)));
`;

const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * The complete template page for a style. The cards come from `cards.js` beside the page, the script named here, or are
 * written into the page with the card to show (the brand kit's preview, the editor's) or, to export, every card.
 */
export function cardTemplate(
  style: CardStyle,
  source:
    | string
    | { cards: TemplateCard[]; n?: number; exporting?: boolean } = 'cards.js',
): string {
  const size = json({ width: XHS.width, height: XHS.height });
  const cards =
    typeof source === 'string'
      ? `<script src="${source.replace(/[^\w./-]/g, '')}"></script>`
      : `<script>window.CARDS = ${json(source.cards)};${source.n ? ` window.CARD_N = ${Number(source.n)};` : ''}${source.exporting ? ' window.CARD_EXPORT = true;' : ''}</script>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=${XHS.width}">
<title>overflow:pending</title></head>
<body>
${cards}
<script>
const S = ${json(style)};
const XHS = ${size};
${SCRIPT}
</script>
</body></html>
`;
}
