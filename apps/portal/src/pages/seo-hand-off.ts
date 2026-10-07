import { $t } from "@/i18n";
// 交给 Agent from the search pages (2026-10-03): what the person selected becomes one task whose brief carries the data
// behind it (where it ranks, how many people see and click it, which page), with the 做法 that fits by default.
import type { TaskDraft } from "./keyword-hand-off";

const n = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("zh-CN"));
const pos = (v: number | null | undefined) => (v == null || !v ? "—" : v.toFixed(1));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const clip = (s: string, max: number) => s.slice(0, max);
export type Period = { start: string; end: string } | undefined;
const since = (w: Period) => (w ? $t("{0} 至 {1}",{0:w.start,1:w.end}) : $t("最近"));
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
  const lines = rows.slice(0, 40).map((r) => $t("- {0}：平均排名 {1}，曝光 {2}，点击 {3}{4}{5}",{0:r.query,1:pos(r.position),2:n(r.impressions),3:n(r.clicks),4:r.ctr != null ? $t("，点击率 {0}",{0:pct(r.ctr)}) : "",5:r.page ? $t("，排名页面 {0}",{0:r.page}) : ""}));
  return {
    title: clip(rows.length === 1 ? $t("把「{0}」的排名推进前几名",{0:head}) : $t("把「{0}」等 {1} 个查询的排名推进前几名",{0:head,1:rows.length}), 200),
    objective: clip($t("这些查询在 Google 里排进前 5 名：{0}",{0:rows.map((r) => r.query).join("、")}), 1000),
    brief: clip([`Search Console（${since(w)}）里本站已经出现、但还没排到最前面的查询：`, ...lines, ...(rows.length > 40 ? [$t("另有 {0} 个，见搜索表现。",{0:rows.length - 40})] : []), "", page ? $t("主要承接的页面：{0}",{0:page}) : $t("排名页面见上面每一行。"), "建议：对照这些查询看页面的标题、描述、开头是否直接回答问题，内容是否覆盖到，内部链接是否指向这页；不改与这些查询无关的部分。"].join("\n"), 20000),
  };
}

// 搜索表现 · 页面: pages to improve in search.
export type PageRow = { page: string; clicks: number; impressions: number; ctr: number; position: number };
export function pageDraft(rows: PageRow[], w: Period): TaskDraft {
  const head = pathOf(rows[0].page);
  const lines = rows.slice(0, 30).map((r) => $t("- {0}：点击 {1}，曝光 {2}，点击率 {3}，平均排名 {4}",{0:r.page,1:n(r.clicks),2:n(r.impressions),3:pct(r.ctr),4:pos(r.position)}));
  return {
    title: clip(rows.length === 1 ? $t("改进 {0} 的搜索表现",{0:head}) : $t("改进 {0} 等 {1} 个页面的搜索表现",{0:head,1:rows.length}), 200),
    objective: clip($t("这些页面在 Google 里获得更多点击：{0}",{0:rows.map((r) => pathOf(r.page)).join("、")}), 1000),
    brief: clip([`Search Console（${since(w)}）的页面数据：`, ...lines, "", "建议：曝光多、点击率低的先改标题和描述；排名在 5–20 位的补内容和内部链接；先看这页现在主要被哪些查询搜到。"].join("\n"), 20000),
  };
}

// 竞品 · 关键词: words a competitor ranks for, to write or improve content for.
export type CompetitorKeyword = { keyword: string; position: number | null; volume: number | null; traffic?: number | null; url?: string | null; difficulty?: number | null; intent?: string | null; ownClicks?: number | null };
export function competitorKeywordsDraft(domain: string, market: string, rows: CompetitorKeyword[]): TaskDraft {
  const head = rows[0].keyword;
  const lines = rows.slice(0, 40).map((r) => $t("- {0}：{1} 排第 {2} 位{3}，月搜索量 {4}{5}{6}{7}",{0:r.keyword,1:domain,2:r.position ?? "—",3:r.url ? `（${r.url}）` : "",4:n(r.volume),5:r.traffic != null ? $t("，估算流量 {0}",{0:n(r.traffic)}) : "",6:r.difficulty != null ? $t("，难度 {0}",{0:n(r.difficulty)}) : "",7:r.ownClicks != null ? $t("；本站近 28 天点击 {0}",{0:n(r.ownClicks)}) : ""}));
  return {
    title: clip(rows.length === 1 ? $t("围绕「{0}」追上 {1}",{0:head,1:domain}) : $t("围绕「{0}」等 {1} 个词追上 {2}",{0:head,1:rows.length,2:domain}), 200),
    objective: clip($t("本站在这些 {0} 已经排名的词上进入搜索结果前几名：{1}",{0:domain,1:rows.map((r) => r.keyword).join("、")}), 1000),
    brief: clip([`竞品 ${domain} 在 Google（${market}）排名的关键词：`, ...lines, "", "依据：排名、搜索量和流量是 DataForSEO 的市场估算，不是本站数据。", "建议：先看竞品排名的页面写了什么、回答了哪些问题，再决定本站新写还是改哪一页；不要照搬。"].join("\n"), 20000),
  };
}

// 竞品 · 页面: a competitor's pages that draw the most traffic, to compare against ours.
export type CompetitorPage = { url: string; traffic: number | null; keywords: number | null };
export function competitorPagesDraft(domain: string, market: string, rows: CompetitorPage[]): TaskDraft {
  const lines = rows.slice(0, 20).map((r) => $t("- {0}：估算流量 {1}，排名关键词 {2} 个",{0:r.url,1:n(r.traffic),2:n(r.keywords)}));
  return {
    title: clip(rows.length === 1 ? $t("对比 {0} 的 {1}",{0:domain,1:pathOf(rows[0].url)}) : $t("对比 {0} 流量最多的 {1} 个页面",{0:domain,1:rows.length}), 200),
    objective: clip($t("弄清这些竞品页面为什么能带来流量，本站缺什么、该补什么"), 1000),
    brief: clip([`竞品 ${domain} 在 Google（${market}）流量较多的页面：`, ...lines, "", "依据：流量和关键词数是 DataForSEO 的市场估算。", "建议：读这些页面，对比本站同主题的内容：覆盖的问题、结构、示例、更新时间；最后列出本站要补的内容和建议的页面。"].join("\n"), 20000),
  };
}

// 页面: one page of 网站内容 with its recent numbers.
export type ContentPage = { url: string; title?: string; views?: number | null; clicks?: number | null; impressions?: number | null; position?: number | null; words?: number | null };
export function contentPageDraft(p: ContentPage, rangeLabel: string): TaskDraft {
  const name = p.title || pathOf(p.url);
  return {
    title: clip($t("优化「{0}」",{0:name}), 200),
    objective: clip($t("让 {0} 获得更多访问和搜索点击",{0:p.url}), 1000),
    brief: clip([`页面：${p.url}`, `${rangeLabel}：访问 ${n(p.views)}，搜索点击 ${n(p.clicks)}，曝光 ${n(p.impressions)}，平均排名 ${pos(p.position)}${p.words != null ? $t("，正文约 {0} 字",{0:n(p.words)}) : ""}`, "", "建议：先看这页的搜索查询和访问来源，再改标题、描述、开头和缺少的内容；不改与本页无关的部分。"].join("\n"), 20000),
  };
}

// 关键词 · 排名跟踪: tracked words with their last two Google checks and Search Console numbers.
export type TrackedRow = { keyword: string; market: string; latest: { at: string; position: number | null; url: string | null } | null; previous: { at: string; position: number | null } | null; gsc?: { position: number; clicks: number; page: string } };
export function trackedDraft(rows: TrackedRow[]): TaskDraft {
  const head = rows[0].keyword, ranked = rows.some((r) => r.latest?.position || r.gsc);
  const lines = rows.slice(0, 40).map((r) => `- ${r.keyword}（${r.market}）：${r.latest ? $t("{0} Google 第 {1}{2}{3}",{0:r.latest.at.slice(0, 10),1:r.latest.position ?? $t("100 名外"),2:r.latest.position ? $t(" 位") : "",3:r.latest.url ? `（${r.latest.url}）` : ""}) : $t("还没检查")}${r.previous ? $t("，上次第 {0}{1}",{0:r.previous.position ?? $t("100 名外"),1:r.previous.position ? $t(" 位") : ""}) : ""}${r.gsc ? $t("；Search Console 近 28 天平均排名 {0}，点击 {1}",{0:r.gsc.position.toFixed(1),1:n(r.gsc.clicks)}) : ""}`);
  return {
    title: clip(rows.length === 1 ? $t("提升「{0}」的排名",{0:head}) : $t("提升「{0}」等 {1} 个关键词的排名",{0:head,1:rows.length}), 200),
    objective: clip($t("这些跟踪的关键词在 Google 排进前几名：{0}",{0:rows.map((r) => r.keyword).join("、")}), 1000),
    brief: clip(["排名跟踪（每周在 Google 桌面端查前 100 名）的结果：", ...lines, "", ranked ? $t("建议：先改已经排上的那一页；名次下降的先看最近改过什么、搜索结果里出现了谁。") : $t("建议：本站还没排上，先确定由哪一页承接，再写或补内容。")].join("\n"), 20000),
  };
}
export const trackedPage = (rows: TrackedRow[]) => mainPage(rows.map((r) => ({ page: r.latest?.url || r.gsc?.page || null, impressions: r.latest?.position ? 101 - r.latest.position : 1 })));

// 竞品 run on your own domain · 页面: your pages by estimated traffic, to improve.
export function ownPagesDraft(domain: string, market: string, rows: CompetitorPage[]): TaskDraft {
  const lines = rows.slice(0, 20).map((r) => $t("- {0}：估算流量 {1}，排名关键词 {2} 个",{0:r.url,1:n(r.traffic),2:n(r.keywords)}));
  return {
    title: clip(rows.length === 1 ? $t("改进 {0}",{0:pathOf(rows[0].url)}) : $t("改进 {0} 的 {1} 个页面",{0:domain,1:rows.length}), 200),
    objective: clip($t("让这些页面在 Google 里排得更好、带来更多点击"), 1000),
    brief: clip([`本站在 Google（${market}）流量较多的页面（DataForSEO 估算）：`, ...lines, "", "建议：结合 Search Console 看这些页面的查询和点击率，先改标题、描述和开头，再补内容。"].join("\n"), 20000),
  };
}

// 社区 and GitHub lists: discussions to sort into questions and answer with docs or product fixes (社区问题汇总).
export type DiscussionItem = { title: string; url: string; meta?: string; excerpt?: string };
export function discussionsDraft(where: string, noun: string, items: DiscussionItem[]): TaskDraft {
  const lines = items.slice(0, 40).map((i) => `- ${i.title}${i.meta ? `（${i.meta}）` : ""}：${i.url}${i.excerpt ? `\n  ${i.excerpt}` : ""}`);
  return {
    title: clip($t("汇总{0}的 {1} 个{2}",{0:where,1:items.length,2:noun}), 200),
    objective: clip($t("弄清{0}里大家在问什么、说什么，哪些能用文档解决，哪些要改产品",{0:where}), 1000),
    brief: clip([`${where}的${noun}：`, ...lines, "", "建议：按问题归类，每类写清在问什么、出现几次、典型链接、仓库里有没有文档已经覆盖，最后给出该补的文档或该反馈的产品问题。"].join("\n"), 20000),
  };
}

// 访问 · 页面详情: a page's GA4 numbers and the search queries that reach it.
export function visitPageDraft(page: string, period: string, views: number, conversions: number, share: string, queries: { keyword: string; clicks?: number | null; impressions?: number | null }[]): TaskDraft {
  return {
    title: clip($t("优化 {0}",{0:pathOf(page)}), 200),
    objective: clip($t("让 {0} 带来更多关键行为（注册、下载、联系等），并在搜索里获得更多点击",{0:page}), 1000),
    brief: clip([`页面：${page}`, `${period}：浏览 ${n(views)}（占全站 ${share}），关键事件 ${n(conversions)}`, ...(queries.length ? [$t("搜索查询："), ...queries.slice(0, 10).map((q) => $t("- {0}：点击 {1}，曝光 {2}",{0:q.keyword,1:n(q.clicks),2:n(q.impressions)}))] : []), "", "建议：先看访问者从哪来、想找什么，再改开头、行动入口和缺少的内容。"].join("\n"), 20000),
  };
}

// 趋势: related searches picked on the 趋势 page, to see whether a page should answer them (内容选题与大纲).
export type TrendQuery = { query: string; value: number; kind: "rising" | "top" };
export function trendsDraft(term: string, place: string, rows: TrendQuery[]): TaskDraft {
  const lines = rows.slice(0, 40).map((r) => `- ${r.query}：${r.kind === "rising" ? $t("上升 +{0}%",{0:n(r.value)}) : $t("热度 {0}",{0:n(r.value)})}`);
  return {
    title: clip(rows.length === 1 ? $t("内容选题：{0}",{0:rows[0].query}) : $t("内容选题：{0} 个「{1}」的相关搜索",{0:rows.length,1:term}), 200),
    objective: clip($t("弄清这些搜索背后大家想知道什么，决定是新写页面还是补进现有页面"), 1000),
    brief: clip([`Google Trends 里「${term}」的相关搜索（${place}，过去 12 个月）：`, ...lines, "", "建议：先在网站内容里找有没有已经回答的页面；没有就给出新页面的标题、大纲和要回答的问题，有就说明要补什么。"].join("\n"), 20000),
  };
}

// 竞品 › 动态: picked competitor updates (new pages, releases) to compare with what we have (竞品对比).
export type CompetitorEvent = { competitor: string; type: "page" | "release" | "site"; title: string; url: string; detail: string; at: string };
export function competitorEventsDraft(rows: CompetitorEvent[]): TaskDraft {
  const names = [...new Set(rows.map((r) => r.competitor))];
  const label = { page: $t("新页面"), release: $t("新版本"), site: $t("网站变化") } as const;
  const lines = rows.slice(0, 40).map((r) => $t("- {0} · {1}：{2}（{3} 发现）{4}{5}",{0:r.competitor,1:label[r.type],2:r.title,3:r.at.slice(0, 10),4:r.url,5:r.detail ? `\n  ${r.detail}` : ""}));
  return {
    title: clip($t("竞品对比：{0} 的 {1} 条新动态",{0:names.join("、"),1:rows.length}), 200),
    objective: clip($t("看清竞品新做了什么，我们有没有对应的内容或功能，要不要跟进"), 1000),
    brief: clip(["竞品最近的动态（每周从官网 sitemap 和 GitHub 看到的）：", ...lines, "", "建议：逐条打开看它讲了什么；对照我们的网站和文档，说明我们已经有、缺少还是做得更好，最后列出值得跟进的内容（新页面、补充段落或产品反馈）。"].join("\n"), 20000),
  };
}
