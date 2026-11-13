// @ts-nocheck
import { randomUUID } from 'node:crypto';
import { systemMessageText } from '../../shared/i18n/messages.js';
import { pageIdentity, pageKey } from '../../shared/page-identity.js';
import { topicKey } from '../../shared/followed-topics.js';
import { awaitingRestart } from '../../shared/task-pending.js';
import {
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

// Content workshop (2026-11-13 user decision): articles and topics adapted into posts for other platforms. The page
// recommends articles from the site's own figures (no paid lookups, no AI judgement), lists the workshop's tasks, and
// creates one task per chosen form and destination, each started with the chosen Agent. The brand kit holds what the
// adaptations need about the brand beyond Memory: for now, the project's own community and its sections.

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY);
// Recently doing well: published in the last 30 days, or clicks up by 30% or more on the week before with 20 or more.
const RECENT_DAYS = 30, RISE = 0.3, RISE_MIN = 20, ROWS = 5, ARTICLES_MAX = 500, RECORDS_MAX = 200, SUM_TTL = 3600000;
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

  // Search Console clicks of every address in four periods back from the last synced day: days 1-7, 8-14, 15-30 and
  // 31-365. Kept for an hour per synced day, so the page is worked out again after each daily sync.
  async clicks(id: string) {
    let link, snaps;
    try { [link, snaps] = await Promise.all([this.p.sync.link(id), this.p.sync.snapshots(id)]); } catch { return null; }
    const site = link?.get('gscSiteUrl'), end = (snaps.find((s: any) => s.key === 'history-search')?.payload || []).map((r: any) => r.date).sort().at(-1);
    if (!site || !end) return null;
    const k = `${id}|${site}|${end}`, kept = this.sums.get(k);
    if (kept && kept.at > Date.now() - SUM_TTL) return kept.value;
    const periods = [[0, 6], [7, 13], [14, 29], [30, 364]].map(([a, b]) => ({ start: addDays(end, -b), end: addDays(end, -a) }));
    const sum = await sumPageDays(this.p.db, String(id), 'gsc', site, periods, { logger: this.p.app?.logger, stopped: () => Boolean(this.p.sync?.stopped) });
    const rows = sum.rows.map((r: any) => ({ url: `https://${r.host}${r.path}`, period: r.period, clicks: Number(r.clicks) || 0 }));
    const value = { end, rows };
    for (const old of this.sums.keys()) if (old.startsWith(`${id}|`)) this.sums.delete(old);
    this.sums.set(k, { at: Date.now(), value });
    return value;
  }

  // The project's tasks the workshop reads: its own (with where each stands) and, from every task, when NocoReach
  // published an article to a page (the first date a page is known to have gone out).
  async tasks(id: string, key: (u: string) => string) {
    const records = [], published = new Map<string, string>();
    for await (const rows of pagesById(this.p.db.getRepository('nrTasks'), { filter: { projectId: id }, fields: ['id', 'title', 'evidence', 'updatedAt'], size: 200 }))
      for (const row of rows) {
        const t = row.toJSON ? row.toJSON() : row, raw = t.evidence?.work;
        const at = String(raw?.release?.article?.published?.at || '').slice(0, 10);
        if (at) for (const u of raw.release.pages || []) { const k = key(u); if (k && !(published.get(k) <= at)) published.set(k, at); }
        if (!raw?.repurpose) continue;
        const w = projectWork(t), st = w.flow?.stages[w.stageIndex || 0], agentStep = w.stage === 'flow' && st?.kind === 'agent';
        records.push({
          taskId: String(t.id), no: t.evidence?.no ?? null, title: t.title, updatedAt: t.updatedAt,
          form: w.repurpose.form, ...(w.repurpose.destination ? { destination: w.repurpose.destination } : {}), source: w.repurpose.source,
          standing: taskStanding(w), ...(agentStep && w.latestRun?.status === 'failed' ? { failed: true } : {}), ...(agentStep && awaitingRestart(w) ? { restart: true } : {}),
        });
      }
    records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return { records, published };
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

  async view(id: string) {
    const [site, brand, project] = await Promise.all([this.p.siteContent?.state(id).catch(() => null), this.brand(id), this.p.projects.get(id).catch(() => null)]);
    const identity = pageIdentity(site), key = (u: string) => { try { return pageKey(u, identity); } catch { return ''; } };
    const { records, published } = await this.tasks(id, key);
    const [sums, cited, reddit] = await Promise.all([this.clicks(id).catch(() => null), this.citations(id, key), this.reddit(id, records)]);
    const clicks = new Map<string, number[]>();
    for (const r of sums?.rows || []) { const k = key(r.url); if (!k) continue; const o = clicks.get(k) || [0, 0, 0, 0]; o[r.period] += r.clicks; clicks.set(k, o); }
    // A page's date: when NocoReach published it, else its sitemap date, else when the sitemap first listed it. A
    // sitemap date half the site's pages share is its build time, and pages listed at the first read have no known
    // date: neither is used, and a page without a date shows none.
    const all = site?.pages || [], pages = all.filter((p: any) => p.type === 'blog' && !p.noindex);
    const stamps = new Map<string, number>(), firstRead = all.map((p: any) => String(p.firstSeenAt || '')).filter(Boolean).sort()[0] || '';
    for (const p of all) { const d = String(p.lastmod || '').slice(0, 10); if (d) stamps.set(d, (stamps.get(d) || 0) + 1); }
    const buildStamp = (d: string) => all.length >= 5 && (stamps.get(d) || 0) >= all.length / 2;
    const made = new Map<string, any[]>();
    for (const r of records) if (r.source?.kind === 'article' && r.standing !== 'closed') {
      const k = key(r.source.url);
      if (k) made.set(k, [...(made.get(k) || []), { form: r.form, ...(r.destination ? { destination: r.destination } : {}), taskId: r.taskId, no: r.no, standing: r.standing }]);
    }
    const byKey = new Map<string, any>();
    for (const p of pages) {
      const k = key(p.url);
      if (!k || byKey.has(k)) continue;
      const lastmod = String(p.lastmod || '').slice(0, 10), seen = String(p.firstSeenAt || '').slice(0, 10);
      const date = published.get(k) || (lastmod && !buildStamp(lastmod) ? lastmod : '') || (seen && firstRead && seen > firstRead.slice(0, 10) ? seen : '');
      const c = clicks.get(k) || [0, 0, 0, 0];
      // A page that went out after the week before began has no full week to compare with.
      const partial = Boolean(date && sums && date > addDays(sums.end, -13));
      byKey.set(k, { url: p.url, title: articleTitle(p), ...(date ? { published: date } : {}), clicks7: c[0], previous7: partial ? 0 : c[1], clicks30: c[0] + c[1] + c[2], clicks12m: c[0] + c[1] + c[2] + c[3], cited: cited.get(k) || 0, made: (made.get(k) || []) });
    }
    const articles = [...byKey.values()];
    const complete = (a: any) => READY_FORMS.every(f => a.made.some((m: any) => m.form === f));
    const since = iso(Date.now() - (RECENT_DAYS - 1) * DAY);
    const recent = articles.filter(a => !complete(a) && ((a.published && a.published >= since) || (sums && a.previous7 > 0 && a.clicks7 >= RISE_MIN && (a.clicks7 - a.previous7) / a.previous7 >= RISE)))
      .sort((a, b) => b.clicks7 - a.clicks7 || String(b.published || '').localeCompare(String(a.published || ''))).slice(0, ROWS);
    const shown = new Set(recent.map(a => a.url));
    const earlier = sums ? articles.filter(a => !a.made.length && !shown.has(a.url) && a.clicks12m > 0).sort((a, b) => b.clicks12m - a.clicks12m).slice(0, ROWS) : [];
    return {
      recent, earlier, searchConnected: Boolean(sums), dataThrough: sums?.end || null,
      articles: articles.sort((a, b) => b.clicks30 - a.clicks30 || a.title.localeCompare(b.title)).slice(0, ARTICLES_MAX),
      records: records.slice(0, RECORDS_MAX), recordCount: records.length,
      brand: { revision: brand.revision, community: brand.community || null },
      // The voice adaptations follow (Memory › Voice and style), shown in the brand kit with a link to change it.
      voice: project ? memoryOf(project).voice : '',
      destinations: { reddit },
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
    const source = cleanSource(v.source), brand = await this.brand(id), items = cleanItems(v.items, brand);
    // A repeated request (a response lost on the way) returns the tasks it made instead of making them again.
    const tasks = this.p.db.getRepository('nrTasks'), prefix = `workshop:${actor}:${requestId}:`, keys = items.map((_, i) => `${prefix}${i}`);
    const existing = await tasks.find({ filter: { projectId: id, taskKey: { $startsWith: prefix } }, fields: ['id', 'taskKey'], limit: 20 });
    if (existing.length) return { taskIds: existing.map((r: any) => [String(r.get('id')), Number(String(r.get('taskKey')).slice(prefix.length))] as const).sort((a, b) => a[1] - b[1]).map(([taskId]) => taskId), started: [] };
    const { playbooks } = await this.p.taskExecution.playbooks.list(id);
    const chosen = items.map(it => playbooks.find((p: any) => p.id === FORM_PLAYBOOK[it.form]) || fail(systemMessageText('playbook.playbookNotExistRefreshPick'), 404));
    const body = source.kind === 'article' ? await this.articleBody(id, source).catch(() => null) : null;
    if (body) Object.assign(source, { targetId: body.targetId, articleId: body.articleId });
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
        const repurpose = { form: item.form, source, ...(item.destination ? { destination: item.destination } : {}) };
        const work = { ...projectWork({ evidence }), playbookId: p.id, repurpose, ...(agent ? { agentId: agent.id, agentName: agent.name } : {}) };
        const row = await tasks.create({ values: { projectId: id, taskKey: keys[i], title: playbookTitle(p, subject.slice(0, 160), locale), brief: repurposeBrief(repurpose, locale), status: systemMessageText('common.pending'), evidence: { ...evidence, work } }, transaction: tx });
        const taskId = String(row.get('id'));
        ids.push(taskId);
        if (body?.body) await this.p.taskExecution.put(this.p.taskExecution.key('source', id, taskId), { body: body.body, locale: body.locale, readAt: at }, tx);
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
