// @ts-nocheck
import { randomUUID } from 'node:crypto';
import { systemMessageText } from '../../shared/i18n/messages.js';
import { pageIdentity, pageKey } from '../../shared/page-identity.js';
import { topicKey } from '../../shared/followed-topics.js';
import { awaitingRestart } from '../../shared/task-pending.js';
import { growthOf, newPageOf } from '../../shared/growth.js';
import {
  ARTICLES_MAX as SUGGESTED_MAX,
  articleOrder,
  articleReasons,
  clickPeriods,
  hotDiscussions,
  hotHeadline,
  hotRows,
  hotSignals,
  hotSubject,
  recommendation,
  seriesOf,
  weeklyDiscussions,
} from '../../shared/workshop-recommend.js';
import {
  ANGLE_MAX,
  COMMUNITY_SECTIONS_MAX,
  FORM_PLAYBOOK,
  LINKS_MAX,
  POINTS_MAX,
  READY_FORMS,
  TOPIC_MAX,
  articleTitle,
  destinationKey,
  isRepurposeForm,
  repurposeBrief,
  sourceSubject,
  subredditName,
} from '../../shared/repurpose.js';
import { projectId, requireAccess } from './policy.js';
import { sumPageDays } from './page-days.js';
import { markQuestions } from './ai-questions.js';
import { pagesById } from './execution/task-scan.js';
import { fail, projectWork, taskStanding } from './execution/model.js';
import { playbookTitle } from './execution/task-title.js';
import { memoryOf } from './execution/memory.js';

// Content workshop (2026-11-13 user decision): articles, topics and trending opportunities adapted into posts for other
// platforms. The page recommends what to adapt from data already collected (no paid lookups, no AI judgement; the rules
// are in shared/workshop-recommend.ts): Opportunities' live Trending now opportunities, and the site's articles by why
// they are worth adapting now. It lists the workshop's tasks, and creates one task per chosen form and destination, each
// started with the chosen Agent. A task made from an opportunity keeps it on its source, which is how Opportunities
// lists it among the opportunity's tasks; the opportunity itself stays as it was. The brand kit holds what the
// adaptations need about the brand beyond Memory: for now, the project's own community and its sections.

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY);
const ARTICLES_MAX = 500, RECORDS_MAX = 200, SUM_TTL = 3600000;
// A trending card shows two discussions and three pieces of the site's material; the Agent gets up to eight links, and
// the approved text of the three latest earlier adaptations.
const HOT_DISCUSSIONS = 2, MATERIAL_MAX = 3, HOT_LINKS = 8, EARLIER_MAX = 3, EARLIER_TEXT = 8000, CHART_POINTS = { week: 8, month: 12, day: 14 };
// Reddit destinations: the subreddits with the most threads on the followed topics in the last four weeks.
const REDDIT_WEEKS = 4, REDDIT_MAX = 3, RECENT_SUBREDDITS = 5, BODY_MAX = 60000;

const clean = (v: unknown, n: number) => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '';
const cleanUrl = (v: unknown) => {
  try {
    const u = new URL(String(v || '').trim());
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && u.href.length <= 2000 ? u.href : '';
  } catch { return ''; }
};

function cleanCommunity(c: any) {
  if (c == null) return null;
  const name = clean(c.name, 60), url = cleanUrl(c.url);
  const sections = [...new Set<string>((Array.isArray(c.sections) ? c.sections : []).map((s: unknown) => clean(s, 60)).filter(Boolean))];
  if (!name || !url || !sections.length) return fail(systemMessageText('workshop.communityIncomplete'));
  if (sections.length > COMMUNITY_SECTIONS_MAX) return fail(systemMessageText('workshop.sectionsMax', { 0: COMMUNITY_SECTIONS_MAX }));
  return { name, url, sections };
}

function cleanSource(s: any) {
  // A trending opportunity is read from Opportunities when the tasks are made (WorkshopService.hotSource).
  if (s?.kind === 'opportunity') {
    const id = clean(s.id, 200);
    return id ? { kind: 'opportunity', id } : fail(systemMessageText('workshop.pickSource'));
  }
  if (s?.kind === 'article') {
    const url = cleanUrl(s.url), title = clean(s.title, 300);
    if (!url || !title) return fail(systemMessageText('workshop.pickSource'));
    return { kind: 'article', url, title };
  }
  if (s?.kind === 'topic') {
    const topic = clean(s.topic, TOPIC_MAX + 1);
    if (!topic) return fail(systemMessageText('workshop.topicRequired'));
    if (topic.length > TOPIC_MAX) return fail(systemMessageText('workshop.topicTooLong', { 0: TOPIC_MAX }));
    const points = typeof s.points === 'string' ? s.points.trim() : '';
    if (points.length > POINTS_MAX) return fail(systemMessageText('workshop.pointsTooLong', { 0: POINTS_MAX }));
    const raw = (Array.isArray(s.links) ? s.links : []).map((l: unknown) => String(l || '').trim()).filter(Boolean);
    if (raw.length > LINKS_MAX) return fail(systemMessageText('workshop.linksMax', { 0: LINKS_MAX }));
    const links = raw.map(cleanUrl);
    if (links.some((l: string) => !l)) return fail(systemMessageText('workshop.linkInvalid'));
    return { kind: 'topic', topic, ...(points ? { points } : {}), ...(links.length ? { links: [...new Set(links)] } : {}) };
  }
  return fail(systemMessageText('workshop.pickSource'));
}

// The chosen forms, each at most once, a community post once per destination; the own community's sections are the
// brand kit's, a subreddit is a valid name.
function cleanItems(items: any, brand: any) {
  if (!Array.isArray(items) || !items.length) return fail(systemMessageText('workshop.pickForm'));
  if (items.length > 10) return fail(systemMessageText('workshop.tooManyItems', { 0: 10 }));
  const seen = new Set<string>(), out = [];
  for (const it of items) {
    if (!isRepurposeForm(it?.form) || !READY_FORMS.includes(it.form)) return fail(systemMessageText('workshop.formUnavailable'));
    let destination;
    if (it.form === 'community') {
      const d = it.destination;
      if (d?.kind === 'reddit') {
        const subreddit = subredditName(d.subreddit);
        if (!subreddit) return fail(systemMessageText('workshop.subredditInvalid'));
        destination = { kind: 'reddit', subreddit, ...(Number.isSafeInteger(d.discussions) && d.discussions > 0 ? { discussions: d.discussions, weeks: REDDIT_WEEKS } : {}) };
      } else if (d?.kind === 'hn') destination = { kind: 'hn' };
      else if (d?.kind === 'own') {
        const c = brand?.community, section = c?.sections.find((s: string) => s === d.section);
        if (!c || !section) return fail(systemMessageText('workshop.brandChanged'), 409);
        destination = { kind: 'own', name: c.name, url: c.url, section };
      } else return fail(systemMessageText('workshop.pickDestination'));
    }
    const key = `${it.form}|${destinationKey(destination)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ form: it.form, ...(destination ? { destination } : {}) });
  }
  return out;
}

// Where a form or destination already stands for an article or a trending opportunity.
const madeOf = (r: any) => ({ form: r.form, ...(r.destination ? { destination: r.destination } : {}), taskId: r.taskId, no: r.no, standing: r.standing, at: r.createdAt });
// What the page is sent of a record and an article.
const shown = ({ internal: _internal, ...r }: any) => r;
const shownArticle = ({ series: _series, partial: _partial, ...a }: any) => a;
// How many discussions a growth rests on: all its rows when every row is one (it keeps fewer than it counts), else
// those read.
const discussionCount = (g: any, discussions: any[]) =>
  discussions.length && g.evidence?.rows.every((r: any) => typeof r.discussion === 'string' && r.discussion)
    ? Math.max(discussions.length, g.evidence.total || 0)
    : discussions.length;

// A trending card's small chart, from data already collected: a discussion growth's weekly discussions, a rising
// keyword's monthly searches, a new repository's stars and a GitHub topic's new repositories a week (GitHub trends);
// none when there is no series.
function chartOf(g: any, subject: string, ght: any) {
  const series = (unit: 'week' | 'month' | 'day', label: string, points: number[]) =>
    points.length >= 3 ? { unit, label: { key: label }, points: points.slice(-CHART_POINTS[unit]) } : null;
  const dated = (o: any) => Object.entries(o || {}).filter(([, v]) => Number.isFinite(v)).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => Number(v));
  const weekly = weeklyDiscussions(g);
  if (weekly.length) return series('week', 'workshop.hot.chartDiscussions', weekly);
  if (g.kind === 'rising' && g.evidence?.columns.some((c: any) => c.key === 'month'))
    return series('month', 'workshop.hot.chartSearches', g.evidence.rows.filter((r: any) => typeof r.month === 'string' && Number.isFinite(r.volume)).sort((a: any, b: any) => a.month.localeCompare(b.month)).map((r: any) => r.volume));
  if (g.kind === 'new-repo' && subject) return series('day', 'workshop.hot.chartStars', dated(ght?.stars?.[subject]));
  if (g.kind === 'topic-heat' && subject) return series('week', 'workshop.hot.chartRepos', dated(ght?.weekly?.[subject]));
  return null;
}

// How a destination reads in a task title: "r/selfhosted", "Hacker News", "Forum · Tutorials".
const titleDestination = (d: any) => d.kind === 'reddit' ? `r/${d.subreddit}` : d.kind === 'hn' ? 'Hacker News' : `${d.name} · ${d.section}`;

class WorkshopService {
  p: any;
  sums = new Map<string, { at: number; value: any }>();
  constructor(p: any) { this.p = p; }
  repo() { return this.p.db.getRepository('nrSnapshots'); }
  brandKey(id: string) { return `brand-kit:${id}`; }
  async brand(id: string, tx?: any) {
    const row = await this.repo().findOne({ filter: { key: this.brandKey(id) }, transaction: tx });
    return row?.get('payload') || { revision: 0, community: null };
  }
  // The brand kit is saved whole under a revision, as analysis rules and targets are: a second window's save is refused.
  async saveBrand(id: string, v: any) {
    const community = cleanCommunity(v.community);
    return this.p.db.sequelize.transaction(async (tx: any) => {
      await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: this.brandKey(id) }, transaction: tx });
      const row = await this.repo().findOne({ filter: { key: this.brandKey(id) }, transaction: tx }), cur = row?.get('payload') || { revision: 0, community: null };
      if (v.revision !== cur.revision) return fail(systemMessageText('workshop.brandChanged'), 409);
      const next = { revision: cur.revision + 1, community, updatedAt: new Date().toISOString() };
      if (row) await this.repo().update({ filterByTk: row.get('id'), values: { payload: next }, transaction: tx });
      else await this.repo().create({ values: { key: this.brandKey(id), payload: next }, transaction: tx });
      return next;
    });
  }

  // Search Console clicks of every address in the periods shared/workshop-recommend.ts sums them in (clickPeriods): the
  // last eight weeks and twelve months back from the last synced day. Kept for an hour per synced day, so the page is
  // worked out again after each daily sync.
  async clicks(id: string) {
    let link, snaps;
    try { [link, snaps] = await Promise.all([this.p.sync.link(id), this.p.sync.snapshots(id)]); } catch { return null; }
    const site = link?.get('gscSiteUrl'), end = (snaps.find((s: any) => s.key === 'history-search')?.payload || []).map((r: any) => r.date).sort().at(-1);
    if (!site || !end) return null;
    const k = `${id}|${site}|${end}`, kept = this.sums.get(k);
    if (kept && kept.at > Date.now() - SUM_TTL) return kept.value;
    const periods = clickPeriods(end);
    const sum = await sumPageDays(this.p.db, String(id), 'gsc', site, periods, { logger: this.p.app?.logger, stopped: () => Boolean(this.p.sync?.stopped) });
    const rows = sum.rows.map((r: any) => ({ url: `https://${r.host}${r.path}`, period: r.period, clicks: Number(r.clicks) || 0 }));
    const value = { end, periods, rows };
    for (const old of this.sums.keys()) if (old.startsWith(`${id}|`)) this.sums.delete(old);
    this.sums.set(k, { at: Date.now(), value });
    return value;
  }

  // The project's tasks the workshop reads: its own, with where each stands, when it was made, its approved draft and
  // the figures kept when it was made; where every task stands, by id, with its number and playbook (the tasks handed
  // off from a trending opportunity); and when NocoReach published an article to a page (the first date a page is known
  // to have gone out).
  async tasks(id: string, key: (u: string) => string) {
    const records = [], published = new Map<string, string>(), info = new Map<string, any>();
    for await (const rows of pagesById(this.p.db.getRepository('nrTasks'), { filter: { projectId: id }, fields: ['id', 'title', 'taskKey', 'evidence', 'createdAt', 'updatedAt'], size: 200 }))
      for (const row of rows) {
        const t = row.toJSON ? row.toJSON() : row, raw = t.evidence?.work;
        const at = String(raw?.release?.article?.published?.at || '').slice(0, 10);
        if (at) for (const u of raw.release.pages || []) { const k = key(u); if (k && !(published.get(k) <= at)) published.set(k, at); }
        const w = projectWork(t), standing = taskStanding(w);
        info.set(String(t.id), { no: t.evidence?.no ?? null, standing, playbook: w.playbook?.name || null });
        if (!raw?.repurpose) continue;
        const st = w.flow?.stages[w.stageIndex || 0], agentStep = w.stage === 'flow' && st?.kind === 'agent';
        const approved = [...(w.results || [])].reverse().find((x: any) => x?.approvedAt && !x.rejectedAt && x.content);
        records.push({
          taskId: String(t.id), no: t.evidence?.no ?? null, title: t.title, createdAt: t.createdAt, updatedAt: t.updatedAt,
          form: w.repurpose.form, ...(w.repurpose.destination ? { destination: w.repurpose.destination } : {}), source: w.repurpose.source,
          standing, ...(agentStep && w.latestRun?.status === 'failed' ? { failed: true } : {}), ...(agentStep && awaitingRestart(w) ? { restart: true } : {}),
          // For the server only: the page is sent the records without them (shown()).
          internal: { approved: approved ? { text: String(approved.content), at: approved.approvedAt } : null, baseline: w.repurpose.baseline || null, batch: String(t.taskKey || '').replace(/:\d+$/, '') },
        });
      }
    records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return { records, published, info };
  }

  // The Reddit destinations: subreddits discussing the followed topics in the last four weeks, most threads first; and
  // the subreddits earlier community posts went to, offered with a box for any other when no thread matched.
  async reddit(id: string, records: any[]) {
    const s = await this.p.reddit?.state(id).catch(() => null), topics = (await this.p.followedTopics?.of(id).catch(() => null)) || [];
    const keys = new Set(topics.map(topicKey)), from = iso(Date.now() - REDDIT_WEEKS * 7 * DAY), by = new Map<string, { subreddit: string; discussions: number }>();
    for (const post of Object.values(s?.topicPosts || {}) as any[]) {
      const day = String(post.postedAt || post.firstSeenAt || '').slice(0, 10), name = subredditName(post.subreddit);
      if (!name || day < from || !(post.topics || []).some((t: string) => keys.has(topicKey(t)))) continue;
      const o = by.get(name.toLowerCase()) || { subreddit: name, discussions: 0 };
      o.discussions++; by.set(name.toLowerCase(), o);
    }
    const recent = [...new Set(records.filter(r => r.destination?.kind === 'reddit').map(r => r.destination.subreddit))].slice(0, RECENT_SUBREDDITS);
    return { subreddits: [...by.values()].sort((a, b) => b.discussions - a.discussions || a.subreddit.localeCompare(b.subreddit)).slice(0, REDDIT_MAX), weeks: REDDIT_WEEKS, recent };
  }

  // How many AI answers (one per platform and question) cite each of the project's pages.
  async citations(id: string, key: (u: string) => string) {
    const cited = new Map<string, number>(), state = await this.p.aiQuestions?.state(id).catch(() => null);
    if (!state) return cited;
    const parties = await this.p.aiQuestions.parties(id).catch(() => null);
    if (!parties) return cited;
    for (const q of markQuestions(state, parties))
      for (const k of new Set(q.sources.filter((x: any) => x.own && x.url).map((x: any) => key(x.url))))
        if (k) cited.set(k, (cited.get(k) || 0) + 1);
    return cited;
  }

  // What the page and the dialog read: the site's pages by key, the tasks, Search Console's clicks, AI citations, the
  // Reddit destinations and GitHub's trends.
  async inputs(id: string) {
    const [site, brand, project] = await Promise.all([this.p.siteContent?.state(id).catch(() => null), this.brand(id), this.p.projects.get(id).catch(() => null)]);
    const identity = pageIdentity(site), key = (u: string) => { try { return pageKey(u, identity); } catch { return ''; } };
    const { records, published, info } = await this.tasks(id, key);
    const [sums, cited, reddit, ght] = await Promise.all([this.clicks(id).catch(() => null), this.citations(id, key), this.reddit(id, records), this.p.githubTrends?.state(id).catch(() => null)]);
    return { site, brand, project, key, records, published, info, sums, cited, reddit, ght };
  }

  async view(id: string) {
    const input = await this.inputs(id), { site, brand, project, key, records, published, sums, cited, reddit } = input;
    const periods = sums?.periods || [], clicks = new Map<string, number[]>();
    for (const r of sums?.rows || []) { const k = key(r.url); if (!k) continue; const o = clicks.get(k) || periods.map(() => 0); o[r.period] += r.clicks; clicks.set(k, o); }
    // A page's date: when NocoReach published it, else its sitemap date, else when the sitemap first listed it. A
    // sitemap date half the site's pages share is its build time, and pages listed at the first read have no known
    // date: neither is used, and a page without a date shows none.
    const all = site?.pages || [], pages = all.filter((p: any) => p.type === 'blog' && !p.noindex);
    const stamps = new Map<string, number>(), firstRead = all.map((p: any) => String(p.firstSeenAt || '')).filter(Boolean).sort()[0] || '';
    for (const p of all) { const d = String(p.lastmod || '').slice(0, 10); if (d) stamps.set(d, (stamps.get(d) || 0) + 1); }
    const buildStamp = (d: string) => all.length >= 5 && (stamps.get(d) || 0) >= all.length / 2;
    const mine = new Map<string, any[]>();
    for (const r of records) if (r.source?.kind === 'article' && r.standing !== 'closed') {
      const k = key(r.source.url);
      if (k) mine.set(k, [...(mine.get(k) || []), r]);
    }
    const byKey = new Map<string, any>();
    for (const p of pages) {
      const k = key(p.url);
      if (!k || byKey.has(k)) continue;
      const lastmod = String(p.lastmod || '').slice(0, 10), seen = String(p.firstSeenAt || '').slice(0, 10);
      const date = published.get(k) || (lastmod && !buildStamp(lastmod) ? lastmod : '') || (seen && firstRead && seen > firstRead.slice(0, 10) ? seen : '');
      const series = seriesOf(clicks.get(k) || [], periods);
      // A page that went out after the week before began has no full week to compare with.
      const partial = Boolean(date && sums && date > addDays(sums.end, -13));
      byKey.set(k, {
        url: p.url, title: articleTitle(p), ...(date ? { published: date } : {}),
        clicks7: series.weeks[0], previous7: partial ? 0 : series.weeks[1], clicks30: series.months[0], clicks12m: series.months.reduce((n, c) => n + c, 0),
        cited: cited.get(k) || 0, made: (mine.get(k) || []).map(madeOf), series, partial,
      });
    }
    // Site articles: each with the reasons it is worth adapting now, unless it was adapted too recently
    // (shared/workshop-recommend.ts). The last adaptation is the latest request's tasks.
    const now = Date.now(), today = iso(now), suggested = [];
    for (const [k, a] of byKey) {
      const figures = { ...a.series, published: a.published, cited: a.cited, partial: a.partial };
      const reasons = articleReasons(figures, { today, searched: Boolean(sums) });
      if (!reasons.length) continue;
      const made = [...(mine.get(k) || [])].sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))), latest = made[0];
      const last = latest ? { at: String(latest.createdAt), ...(latest.internal.baseline ? { clicks7: latest.internal.baseline.clicks7, cited: latest.internal.baseline.cited } : {}) } : undefined;
      const r = recommendation(figures, reasons, last, { now, end: sums?.end || null });
      if (!r.show) continue;
      const weekly = reasons[0] !== 'steady';
      suggested.push({
        ...figures, title: a.title, reasons,
        article: shownArticle(a),
        spark: sums ? { unit: weekly ? 'week' : 'month', points: [...(weekly ? a.series.weeks : a.series.months)].reverse() } : null,
        ...(latest ? { last: { at: last.at, made: made.filter(m => m.internal.batch === latest.internal.batch).map(madeOf), ...(r.since !== null ? { since: r.since } : {}) } } : {}),
      });
    }
    suggested.sort(articleOrder);
    const hot = await this.hotItems(id, input).catch((e: any) => {
      this.p.app?.logger?.warn?.('NocoReach could not read the trending opportunities for Content workshop', { projectId: id, message: e?.message });
      return [];
    });
    return {
      hot: hot.map(h => h.item),
      suggested: suggested.slice(0, SUGGESTED_MAX).map(({ article, reasons, spark, last }) => ({ ...article, reasons, spark, ...(last ? { last } : {}) })),
      searchConnected: Boolean(sums), dataThrough: sums?.end || null,
      articles: [...byKey.values()].sort((a, b) => b.clicks30 - a.clicks30 || a.title.localeCompare(b.title)).slice(0, ARTICLES_MAX).map(shownArticle),
      records: records.slice(0, RECORDS_MAX).map(shown), recordCount: records.length,
      brand: { revision: brand.revision, community: brand.community || null },
      // The voice adaptations follow (Memory › Voice and style), shown in the brand kit with a link to change it.
      voice: project ? memoryOf(project).voice : '',
      destinations: { reddit },
    };
  }

  // Opportunities' live Trending now opportunities as the workshop's cards (shared/workshop-recommend.ts), each with
  // its opportunity: what is hot and its chart, the growth's first two figures, up to two discussions, the site's pages
  // it rests on, the tasks handed off from it and the workshop's own made from it.
  async hotItems(id: string, { site, key, records, info, ght }: any) {
    const state = await this.p.strategy?.state(id);
    if (!state) return [];
    const pages = new Map<string, any>();
    for (const p of site?.pages || []) { const k = key(p.url); if (k && !pages.has(k)) pages.set(k, p); }
    let origin = '';
    try { origin = new URL(site?.pages?.[0]?.url).origin; } catch { /* no pages read yet */ }
    const standing = (taskId: number) => info.get(String(taskId))?.standing;
    const pageTitle = (u: string) => { const p = pages.get(key(u)); return p ? articleTitle(p) : undefined; };
    return hotRows(state, standing).map(row => {
      const card = row.card, g = growthOf(card.growth), signals = hotSignals(row), subject = hotSubject(card, signals, pageTitle);
      const discussions = hotDiscussions(card.growth), subs = new Map<string, { subreddit: string; discussions: number }>();
      let hn = 0;
      for (const d of discussions)
        if (d.subreddit) { const o = subs.get(d.subreddit.toLowerCase()) || { subreddit: d.subreddit, discussions: 0 }; o.discussions++; subs.set(d.subreddit.toLowerCase(), o); }
        else if (d.logo === 'hackernews') hn++;
      const material = [], seen = new Set<string>();
      const add = (u: unknown) => {
        let href = '';
        try { href = new URL(String(u || ''), origin || undefined).href; } catch { return; }
        const k = key(href), page = k ? pages.get(k) : null;
        if (!page || seen.has(k) || new URL(page.url).pathname === '/') return;
        seen.add(k); material.push({ title: articleTitle(page), url: page.url });
      };
      add(card.target);
      for (const path of newPageOf(card.newPage)?.linkFrom || []) add(path);
      for (const r of g.evidence?.rows || []) add(r.url);
      for (const s of signals) add(s.url);
      const item = {
        id: card.id, no: card.no ?? null, kind: g.kind, title: card.title, firstSeenAt: row.firstSeenAt, foundAt: row.batch.generatedAt,
        headline: hotHeadline(card, signals, pageTitle), figures: g.figures.slice(0, 2),
        logos: [...new Set([...discussions.map(d => d.logo), ...signals.map(s => s.source).filter(Boolean)])].slice(0, 4),
        chart: chartOf(g, subject, ght),
        discussions: discussions.slice(0, HOT_DISCUSSIONS), discussionCount: discussionCount(g, discussions),
        communities: { subreddits: [...subs.values()].sort((a, b) => b.discussions - a.discussions || a.subreddit.localeCompare(b.subreddit)), hn },
        material: material.slice(0, MATERIAL_MAX),
        handed: row.tasks.map(t => ({ taskId: String(t.taskId), no: t.taskNo ?? info.get(String(t.taskId))?.no ?? null, standing: info.get(String(t.taskId))?.standing || 'todo', playbook: info.get(String(t.taskId))?.playbook || null })).filter(t => t.standing !== 'closed'),
        made: records.filter((r: any) => r.source?.kind === 'opportunity' && r.source.id === card.id && r.standing !== 'closed').map(madeOf),
      };
      return { item, card, discussions, material };
    });
  }

  // A trending opportunity as the tasks' source, in the language they are made in: what is hot, and for the Agent the
  // opportunity's analysis, its discussions and the site's material, with their links. Gone from Trending now (ignored,
  // expired or closed since the page loaded), it is refused.
  async hotSource(id: string, opportunityId: string, input: any, locale?: string) {
    const found = (await this.hotItems(id, input)).find(h => h.item.id === opportunityId);
    if (!found) return fail(systemMessageText('workshop.hotGone'), 409);
    const { item, card, discussions, material } = found, text = (k: string, p: Record<string, unknown> = {}) => systemMessageText(k, p, locale);
    const line = (label: string, value?: string) => value?.trim() ? text('common.labelValue', { 0: text(label), 1: value.trim() }) : '';
    const list = (label: string, rows: string[]) => rows.length ? `${text('common.labelValue', { 0: text(label), 1: '' }).trim()}\n${rows.map(r => `- ${r}`).join('\n')}` : '';
    const shownDiscussions = discussions.slice(0, 5);
    const points = [
      line('strategy.briefWhatHappened', card.reason || card.observation),
      line('strategy.briefWhyWorthDoing', card.meaning),
      line('strategy.briefWhatToDo', card.suggestion),
      list('workshop.hot.discussionsLabel', shownDiscussions.map(d => [d.title, [d.place, d.url].filter(Boolean).join(', ')].join(' — '))),
      list('workshop.hot.materialLabel', material.map(m => `${m.title} — ${m.url}`)),
    ].filter(Boolean).join('\n\n');
    const links = [...new Set([...shownDiscussions.map(d => d.url), ...material.map(m => m.url)].filter(Boolean))].slice(0, HOT_LINKS);
    return {
      kind: 'opportunity', id: item.id, ...(item.no ? { no: item.no } : {}),
      headline: (item.headline ? text(item.headline.key, item.headline.params) : card.title).slice(0, 300),
      ...(points ? { points: points.slice(0, POINTS_MAX) } : {}), ...(links.length ? { links } : {}),
    };
  }

  // The article's body from the publishing target holding it, when one does; the Agent reads the page otherwise.
  async articleBody(id: string, source: any) {
    const found = await this.p.articleTargets?.match(id, [source.url]).catch(() => null), a = found?.article;
    if (!a) return null;
    const snap = await this.p.articleTargets.provider(id, a.targetId).get(a.articleId).catch(() => null);
    const locales = Object.entries(snap?.locales || {}).filter(([, f]: any) => typeof f?.body === 'string' && f.body.trim());
    const hit: any = locales.find(([, f]: any) => f.title?.trim() === source.title) || locales[0];
    return { targetId: a.targetId, articleId: a.articleId, ...(hit ? { locale: hit[0], body: hit[1].body.slice(0, BODY_MAX) } : {}) };
  }

  // One task per form and destination, written together with the chosen Agent, then each started as an accepted hand-over
  // is (TaskService.startHandedOver): a task that cannot start waits at Start, its card saying why. The Agent is checked
  // as Set Agent checks it but stored as the task is created, so the activity shows only that the task started; one
  // that cannot be used leaves the tasks at Start. Reads of playbooks, the publishing target and the Agent happen before
  // the write, and the starts after it (SQLite has one connection).
  async create(id: string, v: any, actor: string, actorName: string, locale?: string) {
    const requestId = typeof v.requestId === 'string' && /^[a-zA-Z0-9-]{20,80}$/.test(v.requestId) ? v.requestId : fail(systemMessageText('taskExecution.invalidRequestIdVersion'));
    let source = cleanSource(v.source);
    const brand = await this.brand(id), items = cleanItems(v.items, brand);
    const angle = typeof v.angle === 'string' ? v.angle.trim().replace(/\s+/g, ' ') : '';
    if (angle.length > ANGLE_MAX) fail(systemMessageText('workshop.angleTooLong', { 0: ANGLE_MAX }));
    // A repeated request (a response lost on the way) returns the tasks it made instead of making them again.
    const tasks = this.p.db.getRepository('nrTasks'), prefix = `workshop:${actor}:${requestId}:`, keys = items.map((_, i) => `${prefix}${i}`);
    const existing = await tasks.find({ filter: { projectId: id, taskKey: { $startsWith: prefix } }, fields: ['id', 'taskKey'], limit: 20 });
    if (existing.length) return { taskIds: existing.map((r: any) => [String(r.get('id')), Number(String(r.get('taskKey')).slice(prefix.length))] as const).sort((a, b) => a[1] - b[1]).map(([taskId]) => taskId), started: [] };
    const { playbooks } = await this.p.taskExecution.playbooks.list(id);
    const chosen = items.map(it => playbooks.find((p: any) => p.id === FORM_PLAYBOOK[it.form]) || fail(systemMessageText('playbook.playbookNotExistRefreshPick'), 404));
    // An article or a trending opportunity adapted before: the Agent reads the approved drafts of the latest earlier
    // tasks and takes another angle. An article keeps its figures now, for when it is recommended again.
    const input = source.kind === 'topic' ? null : await this.inputs(id);
    if (source.kind === 'opportunity') source = await this.hotSource(id, source.id, input, locale);
    const k = source.kind === 'article' ? input.key(source.url) : '';
    const same = (r: any) => source.kind === 'article' ? r.source?.kind === 'article' && Boolean(k) && input.key(r.source.url) === k : source.kind === 'opportunity' && r.source?.kind === 'opportunity' && r.source.id === source.id;
    const earlier = input ? input.records.filter((r: any) => same(r) && r.internal.approved).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, EARLIER_MAX) : [];
    let baseline = null;
    if (k && input.sums) {
      const byPeriod = input.sums.periods.map(() => 0);
      for (const r of input.sums.rows) if (input.key(r.url) === k) byPeriod[r.period] += r.clicks;
      baseline = { clicks7: seriesOf(byPeriod, input.sums.periods).weeks[0], cited: input.cited.get(k) || 0 };
    }
    const body = source.kind === 'article' ? await this.articleBody(id, source).catch(() => null) : null;
    if (body) Object.assign(source, { targetId: body.targetId, articleId: body.articleId });
    const kept = {
      ...(body?.body ? { body: body.body, locale: body.locale } : {}),
      ...(earlier.length ? { earlier: earlier.map((e: any) => ({ ...(e.no ? { no: e.no } : {}), form: e.form, ...(e.destination ? { destination: e.destination } : {}), at: e.createdAt, text: e.internal.approved.text.slice(0, EARLIER_TEXT) })) } : {}),
    };
    const agentId = typeof v.agentId === 'string' && v.agentId ? v.agentId : null;
    const agent = agentId ? await this.p.db.sequelize.transaction((tx: any) => this.p.taskExecution.agents.taskAgent(agentId, actor, tx, id)).catch((e: any) => {
      this.p.app?.logger?.warn?.('NocoReach could not use the Agent chosen in Content workshop', { projectId: id, agentId, message: e?.message });
      return null;
    }) : null;
    const ids: string[] = [], at = new Date().toISOString();
    await this.p.db.sequelize.transaction(async (tx: any) => {
      for (const [i, item] of items.entries()) {
        const p = chosen[i], subject = item.destination ? `${sourceSubject(source)} → ${titleDestination(item.destination)}` : sourceSubject(source);
        const evidence = { origin: 'workshop', source: 'workshop', createdBy: { id: actor, name: actorName }, autoTitle: { subject: subject.slice(0, 160), ...(locale ? { locale } : {}) }, suggestedPlaybook: p.id };
        const repurpose = {
          form: item.form, source, ...(item.destination ? { destination: item.destination } : {}), ...(angle ? { angle } : {}),
          ...(earlier.length ? { earlier: earlier.map((e: any) => ({ taskId: e.taskId, ...(e.no ? { no: e.no } : {}), form: e.form, ...(e.destination ? { destination: e.destination } : {}), at: e.createdAt })) } : {}),
          ...(baseline ? { baseline } : {}),
        };
        const work = { ...projectWork({ evidence }), playbookId: p.id, repurpose, ...(agent ? { agentId: agent.id, agentName: agent.name } : {}) };
        const row = await tasks.create({ values: { projectId: id, taskKey: keys[i], title: playbookTitle(p, subject.slice(0, 160), locale), brief: repurposeBrief(repurpose, locale), status: systemMessageText('common.pending'), evidence: { ...evidence, work } }, transaction: tx });
        const taskId = String(row.get('id'));
        ids.push(taskId);
        if (Object.keys(kept).length) await this.p.taskExecution.put(this.p.taskExecution.key('source', id, taskId), { ...kept, readAt: at }, tx);
      }
    });
    const started = [];
    if (!agentId || agent) for (const taskId of ids) if (await this.start(id, taskId, actor, actorName)) started.push(taskId);
    return { taskIds: ids, started };
  }
  private async start(id: string, taskId: string, actor: string, actorName: string) {
    try {
      const row = await this.p.db.getRepository('nrTasks').findOne({ filter: { id: taskId, projectId: id } }), w = projectWork(row.toJSON ? row.toJSON() : row);
      let revision = w.revision;
      const run = async (command: string, body: object = {}) => { revision = (await this.p.taskExecution.updateTask(id, { taskId, revision, requestId: randomUUID(), command, ...body }, actor, actorName)).work.revision; };
      await run('startTask', { playbookId: w.playbookId });
      return true;
    } catch (e: any) {
      this.p.app?.logger?.warn?.('NocoReach could not start a Content workshop task', { projectId: id, taskId, message: e?.message });
      return false;
    }
  }

  register() {
    const wrap = (fn: (ctx: any, id: string, v: any) => Promise<unknown>) => async (ctx: any, next: () => Promise<void>) => {
      await requireAccess(ctx);
      ctx.set('Cache-Control', 'no-store');
      try {
        const v = ctx.action.params.values || {}, id = projectId(v.projectId);
        await this.p.project(id);
        ctx.body = await fn(ctx, id, v);
        await next();
      } catch (e: any) { ctx.throw(e.status || 502, e.status ? e.message : systemMessageText('workshop.loadFailed')); }
    };
    const user = (ctx: any) => [String(ctx.auth.user.id), ctx.auth.user.nickname || ctx.auth.user.username || String(ctx.auth.user.id)];
    const actions = {
      view: wrap((_ctx, id) => this.view(id)),
      create: wrap((ctx, id, v) => { const [actor, name] = user(ctx); return this.create(id, v, actor, name, ctx.getCurrentLocale?.()); }),
      saveBrand: wrap((_ctx, id, v) => this.saveBrand(id, v)),
    };
    this.p.app.resourceManager.define({ name: 'nrWorkshop', actions });
    this.p.app.acl.allow('nrWorkshop', Object.keys(actions), 'loggedIn');
  }
}

export { WorkshopService };
