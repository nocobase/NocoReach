/**
 * WeChat Official Account layout (Content workshop PR 3, 2026-11-17): an article's Markdown body drawn as HTML with
 * every style inline, to paste into the WeChat editor, which keeps inline styles and drops stylesheets and classes.
 * The brand kit holds the body's font size and line height (`brand-kit:<projectId>` `.wechat`); the color is the
 * brand color of Brand basics. Nothing is created or sent: the page copies the HTML and the person pastes it.
 */

export const WECHAT_FONT_SIZES = [14, 15, 16, 17] as const;
export const WECHAT_LINE_HEIGHTS = [1.6, 1.75, 1.85, 2] as const;
export type WechatFontSize = (typeof WECHAT_FONT_SIZES)[number];
export type WechatLineHeight = (typeof WECHAT_LINE_HEIGHTS)[number];
export type WechatLayout = {
  fontSize: WechatFontSize;
  lineHeight: WechatLineHeight;
};
export const DEFAULT_WECHAT_LAYOUT: WechatLayout = {
  fontSize: 15,
  lineHeight: 1.85,
};

/** The layout a request or a stored brand kit gives, each value one of the choices, else the default. */
export function cleanWechatLayout(value: unknown): WechatLayout {
  const v = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    unknown
  >;
  const fontSize = WECHAT_FONT_SIZES.find((n) => n === v.fontSize);
  const lineHeight = WECHAT_LINE_HEIGHTS.find((n) => n === v.lineHeight);
  return {
    fontSize: fontSize ?? DEFAULT_WECHAT_LAYOUT.fontSize,
    lineHeight: lineHeight ?? DEFAULT_WECHAT_LAYOUT.lineHeight,
  };
}

/** The WeChat editor's limit on an article's title, in bytes of UTF-8 (the brief's rule: warn above it). */
export const WECHAT_TITLE_BYTES = 64;
export const titleBytes = (title: string) =>
  new TextEncoder().encode(title).length;

/** Links WeChat keeps clickable in an article: other WeChat articles. Every other link becomes a numbered reference. */
export const isWechatLink = (url: string) => {
  try {
    return new URL(url).hostname === 'mp.weixin.qq.com';
  } catch {
    return false;
  }
};

/** An address made absolute against the article's page; null for one that is not http(s) once resolved. */
export function absoluteUrl(href: string, pageUrl?: string): string | null {
  try {
    const url = new URL(href, pageUrl || undefined);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Colors

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const mix = (rgb: number[], to: number, share: number) =>
  rgb.map((c) => c + (to - c) * share);

/**
 * The brand color as text on white: the color itself when it reads (contrast 4.5 or more), else darkened until it
 * does, so a light brand color still gives readable headings and links.
 */
export function readableColor(hex: string): string {
  let rgb = channels(hex);
  for (let i = 0; i < 20 && 1.05 / (luminance(rgb) + 0.05) < 4.5; i++)
    rgb = mix(rgb, 0, 0.1);
  return toHex(rgb);
}

/** A pale wash of the brand color, for a table head or a quote's background. */
export const paleColor = (hex: string, share = 0.92) =>
  toHex(mix(channels(hex), 255, share));

/** The inline styles each element is drawn with, from the layout and the brand color. */
export function wechatStyles(layout: WechatLayout, brandColor: string) {
  const { fontSize: size, lineHeight } = layout;
  const brand = readableColor(brandColor);
  const text = '#333333';
  const muted = '#888888';
  const rule = '#e5e5e5';
  return {
    root: `font-size:${size}px;line-height:${lineHeight};color:${text};letter-spacing:0.5px;word-break:break-word;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif`,
    p: `margin:0 0 1em;font-size:${size}px;line-height:${lineHeight};color:${text}`,
    h2: `margin:1.6em 0 0.8em;padding-left:10px;border-left:4px solid ${brand};font-size:${size + 3}px;line-height:1.5;font-weight:bold;color:${brand}`,
    h3: `margin:1.4em 0 0.6em;font-size:${size + 1}px;line-height:1.5;font-weight:bold;color:${text}`,
    h4: `margin:1.2em 0 0.5em;font-size:${size}px;line-height:1.5;font-weight:bold;color:${text}`,
    strong: `font-weight:bold;color:${brand}`,
    em: `font-style:italic`,
    del: `text-decoration:line-through;color:${muted}`,
    a: `color:${brand};text-decoration:none;border-bottom:1px solid ${brand}`,
    ref: `font-size:${Math.max(size - 4, 10)}px;color:${brand};vertical-align:super;line-height:0`,
    ul: `margin:0 0 1em;padding-left:1.5em;list-style-type:disc;color:${text}`,
    taskList: `margin:0 0 1em;padding-left:0.2em;list-style-type:none;color:${text}`,
    ol: `margin:0 0 1em;padding-left:1.5em;list-style-type:decimal;color:${text}`,
    li: `margin:0.3em 0;font-size:${size}px;line-height:${lineHeight};color:${text}`,
    blockquote: `margin:0 0 1em;padding:10px 14px;border-left:3px solid ${brand};background:${paleColor(brandColor, 0.94)};color:#555555;font-size:${size - 1}px`,
    quoteP: `margin:0;font-size:${size - 1}px;line-height:${lineHeight};color:#555555`,
    pre: `margin:0 0 1em;padding:12px 14px;background:#f6f8fa;border-radius:6px;overflow-x:auto;font-size:13px;line-height:1.6;color:#24292f;font-family:Menlo,Consolas,'Courier New',monospace;white-space:nowrap`,
    code: `padding:2px 5px;margin:0 2px;background:#f3f4f6;border-radius:3px;font-size:${Math.max(size - 2, 12)}px;color:${brand};font-family:Menlo,Consolas,'Courier New',monospace`,
    table: `width:100%;margin:0 0 1em;border-collapse:collapse;font-size:${size - 1}px;line-height:1.6`,
    th: `padding:6px 8px;border:1px solid ${rule};background:${paleColor(brandColor)};color:${text};font-weight:bold;text-align:left`,
    td: `padding:6px 8px;border:1px solid ${rule};color:${text}`,
    hr: `margin:1.5em 0;border:0;border-top:1px solid ${rule}`,
    img: `display:block;max-width:100%;height:auto;margin:1em auto;border-radius:4px`,
    references: `margin:2em 0 0;padding-top:1em;border-top:1px solid ${rule}`,
    referencesTitle: `margin:0 0 0.6em;font-size:${size - 1}px;font-weight:bold;color:${muted}`,
    reference: `margin:0 0 0.4em;font-size:${Math.max(size - 3, 12)}px;line-height:1.6;color:${muted};word-break:break-all`,
  };
}
export type WechatStyles = ReturnType<typeof wechatStyles>;

/** A style string as React's style object (`font-size:15px` → `{fontSize: '15px'}`). */
export function styleObject(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of css.split(';')) {
    const i = part.indexOf(':');
    if (i < 1) continue;
    const name = part
      .slice(0, i)
      .trim()
      .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[name] = part.slice(i + 1).trim();
  }
  return out;
}
