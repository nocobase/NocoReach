import type { CardDesign } from '../../../shared/card-design.js';

/**
 * The demo's style in My styles (Card style, 2026-11-17): one a model could have written from "like a design magazine:
 * off-white paper, serif headings, deep green accents, a large faded page number", in the cleaned form a saved style
 * has. The demo's model answers New style with it too (answers.ts), so the demo shows the whole flow.
 */
const CSS = [
  '.card{position:relative;display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:96px 92px 0;background:#f6f3ea;color:#1f2a24}',
  '.mast{flex:none;display:flex;align-items:center;gap:24px;font-size:28px;letter-spacing:3px}',
  '.rule{flex:1;height:2px;background:#1f2a24}',
  '.big-no{position:absolute;top:150px;right:84px;font-family:var(--font-serif);font-size:220px;font-weight:700;line-height:1;color:#1f4d3a;opacity:.14}',
  '.heading{flex:none;font-family:var(--font-serif);font-weight:800;line-height:1.26;letter-spacing:1px;margin-top:150px;padding-right:40px}',
  '.heading .second{color:#1f4d3a}',
  '.bar{flex:none;width:96px;height:8px;background:#1f4d3a;margin-top:52px}',
  '.body{flex:1 1 0;min-height:0;line-height:1.7;padding:44px 0 48px}',
  '.para{margin:0 0 .7em}',
  '.point{display:flex;gap:.6em;align-items:baseline;padding:.42em 0;border-bottom:2px solid rgba(31,77,58,.2)}',
  '.marker{flex:none;font-family:var(--font-serif);font-weight:700;color:#1f4d3a}',
  '.note{font-size:.62em;opacity:.6;margin-top:.6em}',
  '.foot{flex:none;height:140px;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #1f2a24;font-size:26px;letter-spacing:1px}',
  '.logo{width:48px;height:48px;border-radius:12px;background:#1f4d3a;color:#f6f3ea;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:26px;overflow:hidden}',
  '.cover .heading{margin-top:120px}',
  '.cover .body{flex:none;max-height:420px;color:#1f2a24;opacity:.8;padding:44px 0 0}',
  '.contents{flex:1 1 0;min-height:0;overflow:hidden;padding:56px 0 24px}',
  '.item{display:flex;gap:.8em;align-items:baseline;padding:.45em 0;border-top:2px solid rgba(31,42,36,.16)}',
  '.item-no{flex:none;color:#1f4d3a;font-weight:700;font-family:var(--font-serif)}',
  '.end-main{flex:1 1 0;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:44px}',
  '.end .logo{width:132px;height:132px;border-radius:32px;font-size:68px}',
  '.end .heading{margin-top:0}',
  '.end .body{flex:none;padding:0;color:#1f4d3a}',
].join('\n');

const mast =
  '<div class="mast"><span data-slot="brand"></span><span class="rule"></span><span data-slot="page"></span></div>';
const foot = (logo: boolean) =>
  `<div class="foot"><span data-slot="site"></span>${logo ? '<span class="logo" data-slot="logo"></span>' : ''}</div>`;

const DESIGN: CardDesign = {
  css: CSS,
  cover: `<div class="card cover">${mast}<div class="heading" data-slot="heading"></div><div class="bar"></div><div class="body" data-slot="body"></div><div class="contents" data-slot="contents"></div>${foot(true)}</div>`,
  text: `<div class="card text"><div class="big-no" data-slot="no"></div>${mast}<div class="heading" data-slot="heading"></div><div class="bar"></div><div class="body" data-slot="body"></div>${foot(true)}</div>`,
  end: `<div class="card end">${mast}<div class="end-main"><span class="logo" data-slot="logo"></span><div class="heading" data-slot="heading"></div><div class="body" data-slot="body"></div></div>${foot(false)}</div>`,
};

export function demoSavedStyle(lang: 'zh' | 'en'): {
  name: string;
  summary: string;
  design: CardDesign;
} {
  return lang === 'zh'
    ? {
        name: '墨绿杂志',
        summary: '米白纸感、宋体标题、墨绿强调，右上角大号淡色页码。',
        design: DESIGN,
      }
    : {
        name: 'Forest editorial',
        summary:
          'Off-white paper, serif headings, deep green accents, a big faded page number.',
        design: DESIGN,
      };
}
