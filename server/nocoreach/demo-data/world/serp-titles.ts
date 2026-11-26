// What the demo's Google results look like: each site's own kind of page and title (a video on YouTube, a review listing
// on G2 and Capterra, a question on Zhihu and Quora, a repository on GitHub, an article on Medium and DEV), the site
// name Google shows (`website_name`) and its breadcrumb ("https://g2.example › categories › …").
// The Chinese demo searches Google in Taiwan (zh-TW), so its results come from sites read there, and every title is in
// Traditional characters: the demo site's and competitors' titles are written in Simplified and go through
// `traditional()`, whose table covers the characters those titles use.

type Lang = 'zh' | 'en';

/** The other sites around the demo site in its market's results, in the order they rotate. */
export const RESULT_SITES: Record<Lang, readonly string[]> = {
  zh: [
    'vocus.cc',
    'medium.com',
    'g2.example',
    'capterra.example',
    'ptt.cc',
    'youtube.com',
    'dev.to',
    'zhihu.com',
    'ithelp.ithome.com.tw',
    'github.com',
  ],
  en: [
    'zapier.com',
    'medium.com',
    'g2.example',
    'capterra.example',
    'stackoverflow.com',
    'youtube.com',
    'dev.to',
    'reddit.com',
    'quora.com',
    'github.com',
  ],
};

const SITE_NAMES: Record<string, Record<Lang, string>> = {
  'vocus.cc': { zh: '方格子 vocus', en: 'vocus' },
  'zapier.com': { zh: 'Zapier', en: 'Zapier' },
  'medium.com': { zh: 'Medium', en: 'Medium' },
  'g2.example': { zh: 'G2', en: 'G2' },
  'capterra.example': { zh: 'Capterra', en: 'Capterra' },
  'ptt.cc': { zh: '批踢踢實業坊', en: 'PTT' },
  'stackoverflow.com': { zh: 'Stack Overflow', en: 'Stack Overflow' },
  'youtube.com': { zh: 'YouTube', en: 'YouTube' },
  'dev.to': { zh: 'DEV Community', en: 'DEV Community' },
  'zhihu.com': { zh: '知乎', en: 'Zhihu' },
  'ithelp.ithome.com.tw': { zh: 'iT 邦幫忙', en: 'iThome' },
  'github.com': { zh: 'GitHub', en: 'GitHub' },
  'reddit.com': { zh: 'Reddit', en: 'Reddit' },
  'quora.com': { zh: 'Quora', en: 'Quora' },
};

/** The site name Google shows above a result, as DataForSEO's `website_name`. */
export const siteName = (domain: string, lang: Lang) =>
  SITE_NAMES[domain]?.[lang] ?? domain;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// A space between Chinese and Latin letters or digits, the way sites in Taiwan write titles.
const spaced = (s: string) =>
  s
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2');

/**
 * A page of another site in the results for a keyword, in that site's style: its address path and title. `variant` picks
 * another page for a site that appears again further down; `hash` (hex) gives its ids.
 */
export function otherResult(
  lang: Lang,
  domain: string,
  keyword: string,
  variant: number,
  hash: string,
): { path: string; title: string } {
  // Mid-sentence in English the keyword starts in lower case, unless it starts with a name ("Excel import").
  const k =
      lang === 'en' && /^[A-Z][a-z]/.test(keyword)
        ? keyword.charAt(0).toLowerCase() + keyword.slice(1)
        : keyword,
    K = capital(keyword),
    v = variant % 2;
  const slug =
    lang === 'zh'
      ? keyword.trim().replace(/\s+/g, '-')
      : keyword
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
  const digits = (n: number) =>
    String(parseInt(hash.slice(0, 12), 16))
      .slice(0, n)
      .padStart(n, '1');
  const pick = (a: string, b: string) => (v ? b : a);
  const page = (path: string, zh: [string, string], en: [string, string]) => ({
    path: path
      .split('/')
      .map((segment) => encodeURI(segment))
      .join('/'),
    title: lang === 'zh' ? spaced(pick(...zh)) : pick(...en),
  });
  switch (domain) {
    case 'vocus.cc':
      return page(
        `/article/${hash.slice(0, 24)}`,
        [
          `${k}：整理 5 個實用重點｜方格子 vocus`,
          `我們團隊的${k}心得分享｜方格子 vocus`,
        ],
        [
          `${K}: 5 practical points | vocus`,
          `${K}: how our team does it | vocus`,
        ],
      );
    case 'zapier.com':
      return page(
        `/blog/${slug}${pick('-guide', '')}/`,
        [`${k}：2026 完整指南 | Zapier`, `關於${k}，你需要知道的一切 | Zapier`],
        [
          `${K}: A Complete Guide for 2026 | Zapier`,
          `Everything you need to know about ${k} | Zapier`,
        ],
      );
    case 'medium.com':
      return page(
        `/@${pick('teamnotes', 'linwei.pm')}/${slug}-${hash.slice(0, 12)}`,
        [
          `${k}：我們一年來學到的 5 件事 | Medium`,
          `${k}：小團隊的實戰筆記 | Medium`,
        ],
        [
          `${K}: what we learned in our first year | Medium`,
          `${K}: notes from a small team | Medium`,
        ],
      );
    case 'g2.example':
      return page(
        `/categories/${slug}${pick('', '/compare')}`,
        [
          `${k}：2026 年熱門工具評價與比較 | G2`,
          `${k}：使用者評價、價格與替代方案 | G2`,
        ],
        [
          `${K}: Top Tools Compared (2026) | G2`,
          `${K}: Reviews, Pricing and Alternatives | G2`,
        ],
      );
    case 'capterra.example':
      return page(
        lang === 'zh'
          ? `/directory/${digits(5)}/${slug}/software`
          : `/${slug}-software/${pick('', 'compare/')}`,
        [
          `${k}：功能、價格與評價比較 | Capterra`,
          `${k}：2026 年選購指南 | Capterra`,
        ],
        [
          `${K}: Compare Features, Pricing and Reviews | Capterra`,
          `${K}: 2026 Buyer's Guide | Capterra`,
        ],
      );
    case 'ptt.cc':
      return page(
        `/bbs/Office/M.${digits(10)}.A.${hash.slice(0, 3).toUpperCase()}.html`,
        [
          `[問題] ${k}大家都怎麼處理？ - 看板 Office - 批踢踢實業坊`,
          `[心得] ${k}使用心得 - 看板 Office - 批踢踢實業坊`,
        ],
        [
          `${K}? - Office board - PTT`,
          `${K}: my experience - Office board - PTT`,
        ],
      );
    case 'stackoverflow.com':
      return page(
        `/questions/${digits(8)}/${slug}`,
        [
          `${k}：如何避免重複資料？ - Stack Overflow`,
          `${k}的效能問題 - Stack Overflow`,
        ],
        [
          `How to handle field mapping errors in ${k}? - Stack Overflow`,
          `Performance problems with ${k} - Stack Overflow`,
        ],
      );
    case 'youtube.com':
      return page(
        `/watch?v=${Buffer.from(hash.slice(0, 16), 'hex').toString('base64url').slice(0, 11)}`,
        [
          `【教學】${k} 10 分鐘上手 - YouTube`,
          `${k}實際操作示範（完整版） - YouTube`,
        ],
        [
          `${K} Tutorial for Beginners (10 Minutes) - YouTube`,
          `${K}: Full Walkthrough - YouTube`,
        ],
      );
    case 'dev.to':
      return page(
        `/${pick('kaichen', 'opsnotes')}/${slug}-${hash.slice(0, 4)}`,
        [
          `${k}：用開源工具搞定整個流程 - DEV Community`,
          `${k}：我的自動化設定分享 - DEV Community`,
        ],
        [
          `${K} with open source tools: my setup - DEV Community`,
          `${K}: my automation setup - DEV Community`,
        ],
      );
    case 'zhihu.com':
      return page(
        `/question/${digits(9)}`,
        [`${k}有哪些值得推薦的做法？ - 知乎`, `大家都怎麼處理${k}？ - 知乎`],
        [
          `What are good ways to handle ${k}? - Zhihu`,
          `How do you handle ${k}? - Zhihu`,
        ],
      );
    case 'ithelp.ithome.com.tw':
      return page(
        `/articles/${digits(8)}`,
        [
          `Day 12：${k}實作紀錄 - iT 邦幫忙::一起幫忙解決難題，拯救 IT 人的一天`,
          `${k}踩過的坑與解法 - iT 邦幫忙::一起幫忙解決難題，拯救 IT 人的一天`,
        ],
        [
          `Day 12: ${k} in practice - iThome`,
          `${K}: pitfalls and fixes - iThome`,
        ],
      );
    case 'reddit.com': {
      const sub = pick('projectmanagement', 'smallbusiness');
      return page(
        `/r/${sub}/comments/${parseInt(hash.slice(0, 8), 16).toString(36).slice(0, 7)}/${slug.replaceAll('-', '_')}/`,
        [
          `${k}大家都用什麼？ : r/${sub}`,
          `${k}，小團隊有什麼建議？ : r/${sub}`,
        ],
        [
          `${K}: what's working for you? : r/${sub}`,
          `${K}, any advice for a small team? : r/${sub}`,
        ],
      );
    }
    case 'quora.com':
      return page(
        `/${pick('What-do-people-recommend-for', 'What-should-a-small-team-know-about')}-${slug}`,
        [`${k}大家推薦什麼？ - Quora`, `小團隊對${k}該知道什麼？ - Quora`],
        [
          `What do people recommend for ${k}? - Quora`,
          `What should a small team know about ${k}? - Quora`,
        ],
      );
    case 'github.com':
      return page(
        pick(
          lang === 'zh'
            ? '/opentools-tw/awesome-tools'
            : '/opentools/awesome-tools',
          '/kaichen/workflow-kit',
        ),
        [
          `GitHub - opentools-tw/awesome-tools: ${k}相關的開源工具與範例整理`,
          `GitHub - kaichen/workflow-kit: ${k}的範本與腳本`,
        ],
        [
          `GitHub - opentools/awesome-tools: Open source tools and examples for ${k}`,
          `GitHub - kaichen/workflow-kit: Templates and scripts for ${k}`,
        ],
      );
    default:
      return page(`/${slug}`, [k, k], [K, K]);
  }
}

/** Google's breadcrumb for an address: the origin, then the path's segments. */
export function breadcrumb(domain: string, path: string): string {
  const segments = path
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  return [`https://${domain}`, ...segments].join(' › ');
}

// Words before characters: the same Simplified character becomes different Traditional ones.
const PHRASES: [string, string][] = [
  ['重复', '重複'],
  ['恢复', '恢復'],
  ['日历', '日曆'],
  ['联系', '聯繫'],
];
// Pairs of a Simplified character and its Traditional form.
const PAIRS =
  '项項务務与與团團队隊协協说說导導时時间間线線赖賴户戶访訪权權围圍绕繞周週报報机機现現场場记記录錄库庫负負节節个個诺諾检檢计計划劃实實际際费費历歷区區评評论論决決归歸档檔两兩验驗准準总總览覽让讓盘盤动動进進预預约約销銷请請补補价價审審数數据據暂暫联聯测測转轉续續备備会會从從输輸单單发發邮郵范範见見订訂传傳幂冪试試开開吗嗎义義阶階对對们們复復';
const CHARACTERS = new Map(
  Array.from({ length: PAIRS.length / 2 }, (_, i) => [
    PAIRS[2 * i],
    PAIRS[2 * i + 1],
  ]),
);

/** Simplified demo copy in Traditional characters, for results in the Taiwan market. */
export function traditional(text: string): string {
  let out = text;
  for (const [from, to] of PHRASES) out = out.replaceAll(from, to);
  return [...out].map((c) => CHARACTERS.get(c) ?? c).join('');
}
