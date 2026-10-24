import { DAY, escapeHtml as h, notFound, textResponse } from './kit.js';
import { sitemapSection } from './google.js';
import { COMPETITORS } from './script/market.js';
import type { Page } from './script/types.js';
import type { World } from './world.js';

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

function pageHtml(world: World, page: Page, origin: string): string {
  const flags = new Set(page.flags ?? []);
  const lang = world.lang === 'zh' ? 'zh-CN' : 'en';
  const title = world.text(page.title);
  const description = world.text(page.description);
  const nav = world.site.pages
    .filter(
      (p) =>
        ['/', '/pricing'].includes(p.path) ||
        /^\/(docs|solutions)\/[^/]+$/.test(p.path),
    )
    .slice(0, 8)
    .map((p) => `<a href="${origin}${p.path}">${h(world.text(p.title))}</a>`)
    .join('');
  const links = (page.links ?? [])
    .map((path) => {
      const target = world.page(path);
      return `<li><a href="${origin}${path}">${h(target ? world.text(target.title) : path)}</a></li>`;
    })
    .join('');
  const sections = page.sections
    .map(
      ([heading, paragraph]) =>
        `<h2>${h(world.text(heading))}</h2><p>${h(world.text(paragraph))}</p>`,
    )
    .join('');
  // Thin pages say only a sentence or two; the others add the shared guidance a real page would carry.
  // The standing parts a real page of its kind carries; thin pages stay bare.
  const more = flags.has('thin') ? '' : standing(world, page, title);
  const image = flags.has('missing-alt')
    ? `<img src="${origin}/assets${page.path === '/' ? '/home' : page.path}.png" width="960" height="540">`
    : `<img src="${origin}/assets/diagram.svg" alt="${h(title)}" width="960" height="540">`;
  const canonical =
    flags.has('canonical-other') && page.canonical
      ? origin + page.canonical
      : origin + page.path;
  const heading = flags.has('no-h1')
    ? `<div class="title">${h(title)}</div>`
    : `<h1>${h(title)}</h1>`;
  const second = flags.has('two-h1')
    ? `<h1>${h(world.text(page.sections[0][0]))}</h1>`
    : '';
  // Like a real site, docs pages carry the docs menu, articles the latest articles and other pages a footer map;
  // thin pages stay bare and orphans are listed nowhere.
  const section = sitemapSection(page.path);
  const listed = world.site.pages.filter(
    (p) =>
      p.path !== page.path &&
      !p.flags?.includes('orphan') &&
      !p.flags?.includes('noindex'),
  );
  const menu = flags.has('thin')
    ? []
    : section === 'docs'
      ? listed.filter((p) => sitemapSection(p.path) === 'docs')
      : section === 'blog'
        ? listed.filter((p) => sitemapSection(p.path) === 'blog').slice(0, 8)
        : listed.filter((p) => sitemapSection(p.path) === 'pages');
  const menuTitle =
    section === 'docs'
      ? world.lang === 'zh'
        ? '文档目录'
        : 'Documentation'
      : section === 'blog'
        ? world.lang === 'zh'
          ? '最新文章'
          : 'Latest articles'
        : world.lang === 'zh'
          ? '产品与方案'
          : 'Product and solutions';
  const aside = menu.length
    ? `<aside><h3>${menuTitle}</h3><ul>${menu.map((p) => `<li><a href="${origin}${p.path}">${h(world.text(p.title))}</a></li>`).join('')}</ul></aside>`
    : '';
  const published = day(world.now - page.published * DAY);
  const updated = day(world.now - (page.updated ?? page.published) * DAY);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${h(title)}${page.path === '/' ? '' : ` | ${h(world.site.name)}`}</title>${description ? `<meta name="description" content="${h(description)}">` : ''}${flags.has('noindex') ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow">'}<link rel="canonical" href="${canonical}"><meta property="og:title" content="${h(title)}"><meta property="article:published_time" content="${published}"><meta property="article:modified_time" content="${updated}"><link rel="icon" type="image/svg+xml" href="${origin}/favicon.svg"></head><body><header><a href="${origin}/">${h(world.site.name)}</a><nav>${nav}</nav></header><main>${heading}${second}<p class="lead">${h(description || world.text(world.site.tagline))}</p>${image}${sections}${more}${links ? `<ul class="related">${links}</ul>` : ''}</main>${aside}<footer><a href="https://community.${world.project.domain}/">${world.lang === 'zh' ? '社区' : 'Community'}</a><a href="https://github.com/${world.main ? 'nocobase/nocobase' : 'nococrm/nococrm'}">GitHub</a><a href="${origin}/changelog">${world.lang === 'zh' ? '更新日志' : 'Changelog'}</a><span>© ${new Date(world.now).getUTCFullYear()} ${h(world.site.name)}</span></footer></body></html>`;
}

function competitorHtml(
  world: World,
  host: string,
  path: string,
): string | undefined {
  const rival = COMPETITORS.find((c) => c.domain === host);
  const page = rival?.pages.find(([p]) => p === path);
  if (!rival || !page) return undefined;
  const [, title, description] = page;
  const nav = rival.pages
    .map(([p, t]) => `<a href="https://${host}${p}">${h(world.text(t))}</a>`)
    .join('');
  return `<!doctype html><html lang="${world.lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><title>${h(world.text(title))}</title><meta name="description" content="${h(world.text(description))}"><link rel="canonical" href="https://${host}${path}"></head><body><header><a href="https://${host}/">${h(rival.name)}</a><nav>${nav}</nav></header><main><h1>${h(world.text(title))}</h1><p>${h(world.text(description))}</p><p>${h(world.text(rival.tagline))}</p></main></body></html>`;
}

/** Paragraphs a page of each kind carries on a real site: prerequisites and next steps, an author line, who it is for. */
function standing(world: World, page: Page, title: string): string {
  const site = world.site.name;
  const version = world.main
    ? world.lang === 'zh'
      ? 'NocoBase 2.0 及以上版本'
      : 'NocoBase 2.0 and later'
    : world.lang === 'zh'
      ? `${site} 最新版本`
      : `the latest ${site}`;
  const section = sitemapSection(page.path);
  const block = (heading: string, text: string) =>
    `<h2>${h(heading)}</h2><p>${h(text)}</p>`;
  const zh = world.lang === 'zh';
  if (section === 'docs')
    return (
      block(
        zh ? '开始之前' : 'Before you start',
        zh
          ? `本文适用于 ${version}。开始之前，请确认你能以管理员身份登录，并准备一个可以随时重置的测试环境，不要直接在生产数据上尝试改动。`
          : `This guide applies to ${version}. Before you start, make sure you can sign in as an administrator and have a test environment you can reset, so you never try a change on production data first.`,
      ) +
      block(
        zh ? '下一步' : 'What next',
        zh
          ? `完成「${title}」后，可以在社区分享你的配置，或从文档目录继续阅读相关主题。提问时请附上版本号、数据库类型和复现步骤，方便其他人帮你定位问题。`
          : `Once you have finished “${title}”, share your setup in the community or continue with a related topic from the documentation menu. When you ask for help, include your version, your database and the steps to reproduce.`,
      )
    );
  if (section === 'blog') {
    const author = zh ? `${site} 团队` : `The ${site} team`;
    return (
      `<p class="byline">${h(zh ? `作者：${author}` : `By ${author}`)}</p>` +
      block(
        zh ? '延伸阅读' : 'Keep reading',
        zh
          ? `如果你也在做类似的尝试，欢迎在社区分享经验和问题。我们每两周发一封邮件，汇总新文章、版本更新和社区里的精选案例，可以在页面底部订阅。`
          : `If you are trying something similar, share your experience and questions in the community. Every two weeks we send an email with new articles, release notes and the best stories from the community; subscribe at the bottom of the page.`,
      ) +
      block(
        zh ? '写在最后' : 'A note on scope',
        zh
          ? '文中的做法来自我们自己的项目和社区里的讨论，你的环境可能不同。正式推广到整个团队之前，建议先在测试环境里验证一遍。'
          : 'What this article describes comes from our own projects and from conversations in the community, so your setup may differ. Try the changes in a staging environment before you roll them out to everyone.',
      )
    );
  }
  return (
    block(
      zh ? '适合谁' : 'Who it is for',
      zh
        ? `${site} 适合需要把业务数据、流程和权限放在同一个系统里的团队：业务人员可以自己搭建和调整，开发者也保留了完整的扩展空间。`
        : `${site} suits teams that want business data, processes and permissions in one system: business people can build and adjust it themselves, and developers keep full room to extend it.`,
    ) +
    block(
      zh ? '下一步' : 'Next steps',
      zh
        ? '可以先用 Docker 在本地启动体验，或导入一个模板开始；需要评估企业部署时，联系我们安排一次在线演示和部署评审。'
        : 'Start locally with Docker or import a template to begin; if you are evaluating an enterprise deployment, contact us to book a walkthrough and a deployment review.',
    ) +
    block(
      zh ? '常见问题' : 'Questions',
      zh
        ? `可以先试用再决定吗？可以。社区版可以免费私有部署，每个模板的示例数据都展示了一套完整配置，可以直接修改；数据始终保存在你自己的数据库里，以后迁移也不受限制。`
        : `Can I try ${site} before deciding? Yes. The community edition is free to self-host, and the sample data in each template shows a complete setup you can change. Your data stays in your own database, so moving later is never locked in.`,
    )
  );
}

const FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1f4fd8"/><path d="M17 46V18h7l16 18V18h7v28h-7L24 28v18z" fill="#fff"/></svg>';

/** The demo sites and the competitors' sites: pages, robots.txt, sitemaps and icons. */
export function website(world: World, u: URL): Response | undefined {
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  if (COMPETITORS.some((c) => c.domain === host)) {
    if (path === '/robots.txt')
      return textResponse('User-agent: *\nAllow: /\n');
    if (path === '/favicon.svg' || path === '/favicon.ico')
      return textResponse(FAVICON, 'image/svg+xml');
    const html = competitorHtml(world, host, path);
    return html ? textResponse(html, 'text/html; charset=utf-8') : notFound();
  }
  if (host !== world.project.domain) return undefined;
  const origin = `${u.protocol}//${u.hostname}`;
  const lastmod = (page: Page) =>
    day(world.now - (page.updated ?? page.published) * DAY);
  if (path === '/robots.txt')
    return textResponse(
      `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,
    );
  if (path === '/sitemap.xml' || path === '/sitemap_index.xml') {
    const sections = world.main ? ['pages', 'docs', 'blog'] : ['pages', 'docs'];
    return textResponse(
      `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sections.map((s) => `<sitemap><loc>${origin}/sitemap-${s}.xml</loc></sitemap>`).join('')}</sitemapindex>`,
      'application/xml; charset=utf-8',
    );
  }
  const section = /^\/sitemap-(pages|docs|blog)\.xml$/.exec(path)?.[1];
  if (section)
    return textResponse(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${world.site.pages
        .filter(
          (p) =>
            !p.flags?.includes('orphan') && sitemapSection(p.path) === section,
        )
        .map(
          (p) =>
            `<url><loc>${origin}${p.path === '/' ? '/' : p.path}</loc><lastmod>${lastmod(p)}</lastmod></url>`,
        )
        .join('')}</urlset>`,
      'application/xml; charset=utf-8',
    );
  if (path === '/favicon.svg' || path === '/favicon.ico')
    return textResponse(FAVICON, 'image/svg+xml');
  if (path.startsWith('/assets/'))
    return textResponse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#e8eefc"/></svg>',
      'image/svg+xml',
    );
  const page = world.page(path);
  if (!page) return notFound();
  return textResponse(
    pageHtml(world, page, origin),
    'text/html; charset=utf-8',
  );
}
