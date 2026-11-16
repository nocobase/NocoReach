import { XHS } from './repurpose.js';

/**
 * The Xiaohongshu card template (2026-11-16, Content workshop PR 2). One HTML page, built here from the brand kit and
 * given to the Agent with its run's materials (`xhs-card.html`): the Agent writes its cards to `cards.js` beside it
 * (`window.CARDS = [{ layout, heading, text }]`), opens `xhs-card.html?n=3` in a headless browser at 1080×1440 and
 * saves a PNG of each card. Text is set as text, never as HTML. Once fonts have loaded the page lists the cards whose
 * text does not fit on `<body data-overflow>` and in its title (`overflow:none`, `overflow:3,7`), which is how the
 * Agent reports overflow. The demo's card images are rendered from the same page (scripts/render-demo-cards.ts).
 */

export type CardFont = 'sans' | 'serif';
export const CARD_FONTS: readonly CardFont[] = ['sans', 'serif'];
/** Font stacks covering macOS, Windows and Linux, CJK first, so a card looks the same on whichever computer renders it. */
export const FONT_STACKS: Readonly<Record<CardFont, string>> = {
  sans: "'PingFang SC','Hiragino Sans GB','Noto Sans CJK SC','Source Han Sans SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif",
  serif:
    "'Songti SC','Noto Serif CJK SC','Source Han Serif SC','SimSun',Georgia,'Times New Roman',serif",
};
/** The brand kit's three colors: the brand color for the cover, closing page and accents, the text, and the background. */
export type CardColors = { primary: string; text: string; background: string };
export const CARD_COLORS: Readonly<CardColors> = {
  primary: '#1e3a8a',
  text: '#0f172a',
  background: '#f8fafc',
};
export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
/** A logo kept in the brand kit: a PNG, JPEG or WebP data URL of at most this many bytes. */
export const LOGO_BYTES = 200 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ENDING_HEADING_MAX = 40;
export const ENDING_TEXT_MAX = 60;

/** The brand kit's card settings (`brand-kit:{project}` `.cards`); a missing value is its default. */
export type BrandCards = {
  /** A logo uploaded to the brand kit; none is the website's icon. */
  logo?: string | null;
  colors?: Partial<CardColors>;
  font?: CardFont;
  /** The closing page every set ends with, when there is one. */
  ending?: { heading: string; text: string } | null;
};

/** Everything a card is drawn with: the brand kit's settings with their defaults, and the project's name and site. */
export type CardStyle = CardColors & {
  font: CardFont;
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
  const c = cards?.colors || {};
  const logo = cards?.logo || project.icon || undefined;
  return {
    primary: isHexColor(c.primary) ? c.primary : CARD_COLORS.primary,
    text: isHexColor(c.text) ? c.text : CARD_COLORS.text,
    background: isHexColor(c.background)
      ? c.background
      : CARD_COLORS.background,
    font: cards?.font && CARD_FONTS.includes(cards.font) ? cards.font : 'sans',
    brand: String(project.name || '').slice(0, 60),
    ...(project.site ? { site: project.site.slice(0, 100) } : {}),
    ...(logo && LOGO_URL.test(logo) ? { logo } : {}),
    ending: cards?.ending?.heading ? cards.ending : null,
  };
}

/** What the Agent is told of the style, without the logo's bytes, which only the template carries. */
export const styleBrief = ({ logo, ...style }: CardStyle) => ({
  ...style,
  logo: Boolean(logo),
});

/** The card set in `cards.js`, as the template reads it. */
export type TemplateCard = {
  layout: 'cover' | 'text' | 'end';
  heading?: string;
  text: string;
};

// The page's own script, in plain browser JavaScript. `S` is the style and `XHS` the card size.
const SCRIPT = String.raw`
const el = (tag, css, text) => {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text != null) e.textContent = text;
  return e;
};
const mark = (size, fg, bg) => {
  if (S.logo) {
    const box = el('div', 'width:' + size + 'px;height:' + size + 'px;border-radius:' + size * 0.24 + 'px;background:' + bg + ';display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none');
    const img = el('img', 'width:80%;height:80%;object-fit:contain');
    img.src = S.logo;
    box.appendChild(img);
    return box;
  }
  return el('div', 'width:' + size + 'px;height:' + size + 'px;border-radius:' + size * 0.24 + 'px;background:' + bg + ';color:' + fg + ';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:' + size * 0.56 + 'px;flex:none', (S.brand || '·').trim().charAt(0).toUpperCase());
};
const page = (n, total) => String(n).padStart(2, '0') + '/' + String(total).padStart(2, '0');
function card(c, n, total) {
  const root = el('div', 'width:' + XHS.width + 'px;height:' + XHS.height + 'px;position:relative;overflow:hidden;box-sizing:border-box;font-family:' + S.fontStack);
  root.dataset.card = String(n);
  const corner = el('div', 'position:absolute;right:100px;bottom:96px;font-size:34px;opacity:.7', page(n, total));
  if (c.layout === 'cover') {
    root.style.cssText += ';background:' + S.primary + ';color:' + S.background + ';padding:120px 100px';
    const head = el('div', 'display:flex;align-items:center;gap:22px;font-size:38px;font-weight:600;opacity:.92');
    head.append(mark(72, S.primary, S.background), el('span', '', S.brand));
    const fit = el('div', 'position:absolute;left:100px;right:100px;top:400px;bottom:200px;overflow:hidden');
    fit.dataset.fit = '';
    fit.append(
      el('div', 'width:96px;height:14px;border-radius:7px;background:' + S.background + ';opacity:.9;margin-bottom:56px'),
      el('div', 'font-size:112px;font-weight:800;line-height:1.22;letter-spacing:2px;white-space:pre-wrap', c.heading || ''),
      el('div', 'font-size:48px;line-height:1.6;margin-top:48px;opacity:.85;white-space:pre-wrap', c.text || ''),
    );
    root.append(head, fit, corner);
    return root;
  }
  if (c.layout === 'end') {
    root.style.cssText += ';background:' + S.primary + ';color:' + S.background + ';display:flex;align-items:center;justify-content:center;text-align:center;padding:160px 120px';
    const fit = el('div', 'max-height:100%;overflow:hidden;display:flex;flex-direction:column;align-items:center');
    fit.dataset.fit = '';
    fit.append(
      mark(180, S.primary, S.background),
      el('div', 'font-size:72px;font-weight:700;line-height:1.35;margin-top:72px;white-space:pre-wrap', c.heading || ''),
      el('div', 'font-size:44px;line-height:1.6;margin-top:36px;opacity:.85;white-space:pre-wrap', c.text || ''),
    );
    root.append(fit, corner);
    return root;
  }
  root.style.cssText += ';background:' + S.background + ';color:' + S.text + ';padding:120px 100px 220px;display:flex;flex-direction:column';
  root.append(el('div', 'width:80px;height:14px;border-radius:7px;background:' + S.primary + ';flex:none'));
  if (c.heading) root.append(el('div', 'font-size:76px;font-weight:800;line-height:1.3;margin-top:56px;flex:none;white-space:pre-wrap', c.heading));
  const body = el('div', 'font-size:48px;line-height:1.75;margin-top:48px;opacity:.88;flex:1;min-height:0;overflow:hidden;white-space:pre-wrap', c.text || '');
  body.dataset.fit = '';
  const foot = el('div', 'position:absolute;left:100px;bottom:96px;display:flex;align-items:center;gap:18px;font-size:32px;opacity:.6');
  foot.append(mark(48, S.background, S.primary), el('span', '', S.site || S.brand));
  root.append(body, foot, corner);
  return root;
}
const cards = Array.isArray(window.CARDS) ? window.CARDS : [];
const n = Number(window.CARD_N || new URLSearchParams(location.search).get('n')) || 0;
const shown = n ? [n] : cards.map((_, i) => i + 1);
document.body.style.cssText = 'margin:0;' + (n ? '' : 'display:flex;flex-direction:column;gap:24px;background:#e5e7eb');
for (const k of shown) if (cards[k - 1]) document.body.appendChild(card(cards[k - 1], k, cards.length));
document.fonts.ready.then(() => requestAnimationFrame(() => {
  const over = [...document.querySelectorAll('[data-card]')]
    .filter((c) => [...c.querySelectorAll('[data-fit]')].some((f) => f.scrollHeight > f.clientHeight + 1))
    .map((c) => c.dataset.card);
  document.body.dataset.overflow = over.join(',');
  document.title = 'overflow:' + (over.join(',') || 'none');
}));
`;

const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * The complete template page for a style. The cards come from `cards.js` beside the page, the script named here, or are
 * written into the page with the card to show (the brand kit's preview).
 */
export function cardTemplate(
  style: CardStyle,
  source: string | { cards: TemplateCard[]; n?: number } = 'cards.js',
): string {
  const s = json({
    ...style,
    fontStack: FONT_STACKS[style.font] || FONT_STACKS.sans,
  });
  const size = json({ width: XHS.width, height: XHS.height });
  const cards =
    typeof source === 'string'
      ? `<script src="${source.replace(/[^\w./-]/g, '')}"></script>`
      : `<script>window.CARDS = ${json(source.cards)};${source.n ? ` window.CARD_N = ${Number(source.n)};` : ''}</script>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=${XHS.width}">
<title>overflow:pending</title></head>
<body>
${cards}
<script>
const S = ${s};
const XHS = ${size};
${SCRIPT}
</script>
</body></html>
`;
}
