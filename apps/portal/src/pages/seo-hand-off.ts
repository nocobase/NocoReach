// 交给 Agent from the search pages (2026-10-03): what the person selected becomes one task whose brief carries the data
// behind it (where it ranks, how many people see and click it, which page), with the 做法 that fits by default.
import type { TaskDraft } from "./keyword-hand-off";

const n = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("zh-CN"));
const pos = (v: number | null | undefined) => (v == null || !v ? "—" : v.toFixed(1));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const clip = (s: string, max: number) => s.slice(0, max);
export type Period = { start: string; end: string } | undefined;
const since = (w: Period) => (w ? `${w.start} 至 ${w.end}` : "最近");
// The page most of the rows point to (by impressions), linked to the task when it is in 网站内容.
export function mainPage(rows: { page?: string | null; impressions?: number }[]) {
  const by = new Map<string, number>();
  for (const r of rows) if (r.page) by.set(r.page, (by.get(r.page) || 0) + (r.impressions || 0));
  return [...by].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// 搜索表现 · 接近首页 / 查询: queries the site already shows up for, to move up on the page that ranks.
export type QueryRow = { query: string; page?: string | null; clicks: number; impressions: number; position: number; ctr?: number };
export function queryDraft(rows: QueryRow[], w: Period): TaskDraft {
  const head = rows[0].query, page = mainPage(rows);
  const lines = rows.slice(0, 40).map((r) => `- ${r.query}：平均排名 ${pos(r.position)}，曝光 ${n(r.impressions)}，点击 ${n(r.clicks)}${r.ctr != null ? `，点击率 ${pct(r.ctr)}` : ""}${r.page ? `，排名页面 ${r.page}` : ""}`);
  return {
    title: clip(rows.length === 1 ? `把「${head}」的排名推进前几名` : `把「${head}」等 ${rows.length} 个查询的排名推进前几名`, 200),
    objective: clip(`这些查询在 Google 里排进前 5 名：${rows.map((r) => r.query).join("、")}`, 1000),
    brief: clip([`Search Console（${since(w)}）里本站已经出现、但还没排到最前面的查询：`, ...lines, ...(rows.length > 40 ? [`另有 ${rows.length - 40} 个，见搜索表现。`] : []), "", page ? `主要承接的页面：${page}` : "排名页面见上面每一行。", "建议：对照这些查询看页面的标题、描述、开头是否直接回答问题，内容是否覆盖到，内部链接是否指向这页；不改与这些查询无关的部分。"].join("\n"), 20000),
  };
}

// 搜索表现 · 页面: pages to improve in search.
export type PageRow = { page: string; clicks: number; impressions: number; ctr: number; position: number };
export function pageDraft(rows: PageRow[], w: Period): TaskDraft {
  const head = pathOf(rows[0].page);
  const lines = rows.slice(0, 30).map((r) => `- ${r.page}：点击 ${n(r.clicks)}，曝光 ${n(r.impressions)}，点击率 ${pct(r.ctr)}，平均排名 ${pos(r.position)}`);
  return {
    title: clip(rows.length === 1 ? `改进 ${head} 的搜索表现` : `改进 ${head} 等 ${rows.length} 个页面的搜索表现`, 200),
    objective: clip(`这些页面在 Google 里获得更多点击：${rows.map((r) => pathOf(r.page)).join("、")}`, 1000),
    brief: clip([`Search Console（${since(w)}）的页面数据：`, ...lines, "", "建议：曝光多、点击率低的先改标题和描述；排名在 5–20 位的补内容和内部链接；先看这页现在主要被哪些查询搜到。"].join("\n"), 20000),
  };
}

// 竞品 · 关键词: words a competitor ranks for, to write or improve content for.
export type CompetitorKeyword = { keyword: string; position: number | null; volume: number | null; traffic?: number | null; url?: string | null; difficulty?: number | null; intent?: string | null; ownClicks?: number | null };
export function competitorKeywordsDraft(domain: string, market: string, rows: CompetitorKeyword[]): TaskDraft {
  const head = rows[0].keyword;
  const lines = rows.slice(0, 40).map((r) => `- ${r.keyword}：${domain} 排第 ${r.position ?? "—"} 位${r.url ? `（${r.url}）` : ""}，月搜索量 ${n(r.volume)}${r.traffic != null ? `，估算流量 ${n(r.traffic)}` : ""}${r.difficulty != null ? `，难度 ${n(r.difficulty)}` : ""}${r.ownClicks != null ? `；本站近 28 天点击 ${n(r.ownClicks)}` : ""}`);
  return {
    title: clip(rows.length === 1 ? `围绕「${head}」追上 ${domain}` : `围绕「${head}」等 ${rows.length} 个词追上 ${domain}`, 200),
    objective: clip(`本站在这些 ${domain} 已经排名的词上进入搜索结果前几名：${rows.map((r) => r.keyword).join("、")}`, 1000),
    brief: clip([`竞品 ${domain} 在 Google（${market}）排名的关键词：`, ...lines, "", "依据：排名、搜索量和流量是 DataForSEO 的市场估算，不是本站数据。", "建议：先看竞品排名的页面写了什么、回答了哪些问题，再决定本站新写还是改哪一页；不要照搬。"].join("\n"), 20000),
  };
}

// 竞品 · 页面: a competitor's pages that draw the most traffic, to compare against ours.
export type CompetitorPage = { url: string; traffic: number | null; keywords: number | null };
export function competitorPagesDraft(domain: string, market: string, rows: CompetitorPage[]): TaskDraft {
  const lines = rows.slice(0, 20).map((r) => `- ${r.url}：估算流量 ${n(r.traffic)}，排名关键词 ${n(r.keywords)} 个`);
  return {
    title: clip(rows.length === 1 ? `对比 ${domain} 的 ${pathOf(rows[0].url)}` : `对比 ${domain} 流量最多的 ${rows.length} 个页面`, 200),
    objective: clip(`弄清这些竞品页面为什么能带来流量，本站缺什么、该补什么`, 1000),
    brief: clip([`竞品 ${domain} 在 Google（${market}）流量较多的页面：`, ...lines, "", "依据：流量和关键词数是 DataForSEO 的市场估算。", "建议：读这些页面，对比本站同主题的内容：覆盖的问题、结构、示例、更新时间；最后列出本站要补的内容和建议的页面。"].join("\n"), 20000),
  };
}

// 页面: one page of 网站内容 with its recent numbers.
export type ContentPage = { url: string; title?: string; views?: number | null; clicks?: number | null; impressions?: number | null; position?: number | null; words?: number | null };
export function contentPageDraft(p: ContentPage, rangeLabel: string): TaskDraft {
  const name = p.title || pathOf(p.url);
  return {
    title: clip(`优化「${name}」`, 200),
    objective: clip(`让 ${p.url} 获得更多访问和搜索点击`, 1000),
    brief: clip([`页面：${p.url}`, `${rangeLabel}：访问 ${n(p.views)}，搜索点击 ${n(p.clicks)}，曝光 ${n(p.impressions)}，平均排名 ${pos(p.position)}${p.words != null ? `，正文约 ${n(p.words)} 字` : ""}`, "", "建议：先看这页的搜索查询和访问来源，再改标题、描述、开头和缺少的内容；不改与本页无关的部分。"].join("\n"), 20000),
  };
}

// 关键词 · 排名跟踪: tracked words with their last two Google checks and Search Console numbers.
export type TrackedRow = { keyword: string; market: string; latest: { at: string; position: number | null; url: string | null } | null; previous: { at: string; position: number | null } | null; gsc?: { position: number; clicks: number; page: string } };
export function trackedDraft(rows: TrackedRow[]): TaskDraft {
  const head = rows[0].keyword, ranked = rows.some((r) => r.latest?.position || r.gsc);
  const lines = rows.slice(0, 40).map((r) => `- ${r.keyword}（${r.market}）：${r.latest ? `${r.latest.at.slice(0, 10)} Google 第 ${r.latest.position ?? "100 名外"}${r.latest.position ? " 位" : ""}${r.latest.url ? `（${r.latest.url}）` : ""}` : "还没检查"}${r.previous ? `，上次第 ${r.previous.position ?? "100 名外"}${r.previous.position ? " 位" : ""}` : ""}${r.gsc ? `；Search Console 近 28 天平均排名 ${r.gsc.position.toFixed(1)}，点击 ${n(r.gsc.clicks)}` : ""}`);
  return {
    title: clip(rows.length === 1 ? `提升「${head}」的排名` : `提升「${head}」等 ${rows.length} 个关键词的排名`, 200),
    objective: clip(`这些跟踪的关键词在 Google 排进前几名：${rows.map((r) => r.keyword).join("、")}`, 1000),
    brief: clip(["排名跟踪（每周在 Google 桌面端查前 100 名）的结果：", ...lines, "", ranked ? "建议：先改已经排上的那一页；名次下降的先看最近改过什么、搜索结果里出现了谁。" : "建议：本站还没排上，先确定由哪一页承接，再写或补内容。"].join("\n"), 20000),
  };
}
export const trackedPage = (rows: TrackedRow[]) => mainPage(rows.map((r) => ({ page: r.latest?.url || r.gsc?.page || null, impressions: r.latest?.position ? 101 - r.latest.position : 1 })));

// 竞品 run on your own domain · 页面: your pages by estimated traffic, to improve.
export function ownPagesDraft(domain: string, market: string, rows: CompetitorPage[]): TaskDraft {
  const lines = rows.slice(0, 20).map((r) => `- ${r.url}：估算流量 ${n(r.traffic)}，排名关键词 ${n(r.keywords)} 个`);
  return {
    title: clip(rows.length === 1 ? `改进 ${pathOf(rows[0].url)}` : `改进 ${domain} 的 ${rows.length} 个页面`, 200),
    objective: clip("让这些页面在 Google 里排得更好、带来更多点击", 1000),
    brief: clip([`本站在 Google（${market}）流量较多的页面（DataForSEO 估算）：`, ...lines, "", "建议：结合 Search Console 看这些页面的查询和点击率，先改标题、描述和开头，再补内容。"].join("\n"), 20000),
  };
}

// 社区 and GitHub lists: discussions to sort into questions and answer with docs or product fixes (社区问题汇总).
export type DiscussionItem = { title: string; url: string; meta?: string; excerpt?: string };
export function discussionsDraft(where: string, noun: string, items: DiscussionItem[]): TaskDraft {
  const lines = items.slice(0, 40).map((i) => `- ${i.title}${i.meta ? `（${i.meta}）` : ""}：${i.url}${i.excerpt ? `\n  ${i.excerpt}` : ""}`);
  return {
    title: clip(`汇总${where}的 ${items.length} 个${noun}`, 200),
    objective: clip(`弄清${where}里大家在问什么、说什么，哪些能用文档解决，哪些要改产品`, 1000),
    brief: clip([`${where}的${noun}：`, ...lines, "", "建议：按问题归类，每类写清在问什么、出现几次、典型链接、仓库里有没有文档已经覆盖，最后给出该补的文档或该反馈的产品问题。"].join("\n"), 20000),
  };
}

// 访问 · 页面详情: a page's GA4 numbers and the search queries that reach it.
export function visitPageDraft(page: string, period: string, views: number, conversions: number, share: string, queries: { keyword: string; clicks?: number | null; impressions?: number | null }[]): TaskDraft {
  return {
    title: clip(`优化 ${pathOf(page)}`, 200),
    objective: clip(`让 ${page} 带来更多关键行为（注册、下载、联系等），并在搜索里获得更多点击`, 1000),
    brief: clip([`页面：${page}`, `${period}：浏览 ${n(views)}（占全站 ${share}），关键事件 ${n(conversions)}`, ...(queries.length ? ["搜索查询：", ...queries.slice(0, 10).map((q) => `- ${q.keyword}：点击 ${n(q.clicks)}，曝光 ${n(q.impressions)}`)] : []), "", "建议：先看访问者从哪来、想找什么，再改开头、行动入口和缺少的内容。"].join("\n"), 20000),
  };
}
