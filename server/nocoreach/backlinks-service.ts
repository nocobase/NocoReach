// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { VisibilityError } from './research-helpers.js';
import { projectId, requireAccess } from './policy.js';
import { DataForSeo } from './dataforseo.js';
import { host } from './domain-service.js';
// Backlinks (Search & market › Backlinks): after every-app/open-seo db8bde1 src/server/features/backlinks/ and
// src/server/lib/dataforseo/backlinks.ts (MIT). Any site's (or one page's) link profile from the DataForSEO Backlinks
// API, on the shared DataForSEO layer (runs only when asked, monthly budget, 30-day reuse, uncertain results not
// retried). Changes from OpenSEO: one paid query per view instead of one per table page, sort or filter (each view
// reads its first 100 rows, which the page sorts and filters itself); spam is not filtered by the provider, so one
// query serves both an audit of our own links and a look at a competitor's, and the page hides spammy rows on its own;
// no subfolder scope. Lookup reads the overview (summary and, for a site, the last 12 months of history); the
// Backlinks, Referring domains and Top pages tabs are each read only when the person asks for them. Link gap (not in
// OpenSEO) lists the sites that link to up to three competitors but not to us: one domain_intersection request per
// competitor, merged here, so a site counts for every competitor it links to.
const error = (message, status = 400) => {
  throw new VisibilityError(message, status);
};
const VIEWS = ['overview', 'links', 'domains', 'pages', 'gap'];
const LIMIT = 100;
export const GAP_COMPETITORS = 3;
// dataforseo.com/pricing/backlinks, as OpenSEO's src/server/lib/dataforseo/pricing.ts charges it: per task plus per
// returned row, uniform across endpoints.
const TASK_USD = 0.024,
  ROW_USD = 0.000036,
  HISTORY_MONTHS = 13;
const usd = (n) => Number(n.toFixed(6));
// A site (hostname, subdomains included) or one exact page. A page keeps an explicit http:// scheme, as the API
// matches page addresses exactly; a query string or fragment would point at another page, so it is refused.
function target(input) {
  const raw = String(input || '').trim();
  const withPath = /^https?:\/\//i.test(raw)
    ? raw.replace(/^https?:\/\/[^/]+/i, '')
    : raw.replace(/^[^/]+/, '');
  if (!withPath || withPath === '/')
    return { target: host(raw), scope: 'domain' };
  if (/[?#]/.test(raw))
    error(systemMessageText('backlinks.pageAddressNoQuery'));
  const hostname = host(raw),
    path = withPath.replace(/\/{2,}/g, '/');
  return {
    target: `${/^http:\/\//i.test(raw) ? 'http' : 'https'}://${/^(https?:\/\/)?www\./i.test(raw) ? 'www.' : ''}${hostname}${path}`,
    scope: 'page',
  };
}
// What every Backlinks request shares (OpenSEO buildCommonPayload): live links only, internal links left out, ranks
// on DataForSEO's 0–100 scale.
const common = (t) => ({
  target: t,
  include_subdomains: true,
  include_indirect_links: true,
  exclude_internal_backlinks: true,
  backlinks_status_type: 'live',
  rank_scale: 'one_hundred',
});
// History by month from the first day of the month a year back, so the same lookup asked again this month has the
// same specification (and reuses its result); without date_to the provider reads up to today.
function since(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}
// The competitors of a gap lookup: bare domains, never our own, in a fixed order so the same set reuses its result.
function rivals(list, own) {
  const out = [
    ...new Set((Array.isArray(list) ? list : []).map((c) => host(c))),
  ]
    .filter((c) => c !== own && !c.endsWith(`.${own}`))
    .sort();
  if (!out.length || out.length > GAP_COMPETITORS)
    error(
      systemMessageText('backlinks.gapCompetitors', { 0: GAP_COMPETITORS }),
    );
  return out;
}
function specification(v) {
  const view = String(v.view || 'overview');
  if (!VIEWS.includes(view))
    error(systemMessageText('aiSearch.unsupportedQueryType'));
  const t = target(v.target);
  if (view === 'gap') {
    if (t.scope === 'page') error(systemMessageText('backlinks.gapNeedsSite'));
    const competitors = rivals(v.competitors, t.target);
    // Sites linking to this competitor but not to us, strongest first, live links only.
    const requests = competitors.map((c) => ({
      path: 'backlinks/domain_intersection/live',
      body: {
        targets: { 1: c },
        exclude_targets: [t.target],
        include_subdomains: true,
        include_indirect_links: true,
        exclude_internal_backlinks: true,
        backlinks_status_type: 'live',
        rank_scale: 'one_hundred',
        limit: LIMIT,
        order_by: ['1.rank,desc'],
      },
    }));
    return {
      kind: 'backlinks',
      view,
      target: t.target,
      scope: 'domain',
      competitors,
      requests,
      estimatedUsd: usd(competitors.length * (TASK_USD + LIMIT * ROW_USD)),
      reservationUsd: usd(competitors.length * 0.05),
      priceVersion: 'openseo-pricing-2026-10-01',
      schemaVersion: 'backlinks-2026-11-09',
    };
  }
  if (view === 'pages' && t.scope === 'page')
    error(systemMessageText('backlinks.topPagesNeedSite'));
  const base = {
    kind: 'backlinks',
    view,
    target: t.target,
    scope: t.scope,
    priceVersion: 'openseo-pricing-2026-10-01',
    schemaVersion: 'backlinks-2026-11-09',
  };
  if (view === 'overview') {
    const requests = [
      { path: 'backlinks/summary/live', body: common(t.target) },
    ];
    // history/live takes a hostname only, so a page has no trend.
    if (t.scope === 'domain')
      requests.push({
        path: 'backlinks/history/live',
        body: {
          target: t.target,
          date_from: since(),
          rank_scale: 'one_hundred',
        },
      });
    const estimatedUsd = usd(
      TASK_USD +
        ROW_USD +
        (requests.length > 1 ? TASK_USD + HISTORY_MONTHS * ROW_USD : 0),
    );
    return {
      ...base,
      requests,
      estimatedUsd,
      reservationUsd: requests.length > 1 ? 0.08 : 0.05,
    };
  }
  const path = {
    links: 'backlinks/backlinks/live',
    domains: 'backlinks/referring_domains/live',
    pages: 'backlinks/domain_pages_summary/live',
  }[view];
  const request = {
    ...common(t.target),
    limit: LIMIT,
    offset: 0,
    order_by: [view === 'links' ? 'rank,desc' : 'backlinks,desc'],
    ...(view === 'links' ? { mode: 'one_per_domain' } : {}),
  };
  return {
    ...base,
    path,
    request,
    estimatedUsd: usd(TASK_USD + LIMIT * ROW_USD),
    reservationUsd: 0.05,
  };
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' ? v : '');
const day = (v) => str(v).slice(0, 10) || null;
// The provider's outcome of one reply, by its documented codes: a balance problem (40200, 40210, 402) is named so the
// page can say so; anything else keeps its code.
function failure(raw) {
  const task = raw?.tasks?.[0],
    code = raw?.status_code === 20000 ? task?.status_code : raw?.status_code;
  if (
    raw?.status_code === 20000 &&
    code === 20000 &&
    Array.isArray(task?.result)
  )
    return null;
  return [40200, 40210, 402].includes(code)
    ? 'backlinks_balance'
    : `provider_status_${code || 'unknown'}`;
}
const page = (raw) => raw?.tasks?.[0]?.result?.[0] || null;
const cost = (list) =>
  list.every((r) => num(r?.cost) !== null && r.cost >= 0)
    ? usd(list.reduce((n, r) => n + r.cost, 0))
    : null;
// DataForSEO spells some referring-domain counts both ways (`*_reffering_*` and `*_referring_*`).
const either = (o, a, b) => num(o?.[a]) ?? num(o?.[b]);
function summary(s) {
  return {
    rank: num(s.rank),
    backlinks: num(s.backlinks),
    referringDomains: num(s.referring_domains),
    referringMainDomains: num(s.referring_main_domains),
    referringPages: num(s.referring_pages),
    nofollowDomains: num(s.referring_domains_nofollow),
    brokenBacklinks: num(s.broken_backlinks),
    brokenPages: num(s.broken_pages),
    spam: num(s.backlinks_spam_score),
    targetSpam: num(s.info?.target_spam_score),
    firstSeen: day(s.first_seen),
  };
}
function history(items) {
  return (items || [])
    .map((h) => ({
      date: day(h.date),
      backlinks: num(h.backlinks),
      referringDomains: num(h.referring_domains),
      rank: num(h.rank),
      newBacklinks: num(h.new_backlinks),
      lostBacklinks: num(h.lost_backlinks),
      newReferringDomains: either(
        h,
        'new_referring_domains',
        'new_reffering_domains',
      ),
      lostReferringDomains: either(
        h,
        'lost_referring_domains',
        'lost_reffering_domains',
      ),
    }))
    .filter((h) => h.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}
const rows = {
  links: (i, n) => ({
    id: String(n),
    urlFrom: str(i.url_from),
    domainFrom: str(i.domain_from),
    urlTo: str(i.url_to),
    anchor: str(i.anchor),
    itemType: str(i.item_type),
    dofollow: typeof i.dofollow === 'boolean' ? i.dofollow : null,
    rank: num(i.rank),
    domainRank: num(i.domain_from_rank),
    pageRank: num(i.page_from_rank),
    spam: num(i.backlink_spam_score ?? i.backlinks_spam_score),
    firstSeen: day(i.first_seen),
    lastSeen: day(i.lost_date ?? i.last_visited ?? i.last_seen),
    isNew: i.is_new === true,
    isLost: i.is_lost === true || Boolean(i.lost_date),
    isBroken: i.is_broken === true,
  }),
  domains: (i, n) => ({
    id: String(n),
    domain: str(i.domain),
    backlinks: num(i.backlinks),
    referringPages: num(i.referring_pages),
    rank: num(i.rank),
    spam: num(i.backlinks_spam_score),
    firstSeen: day(i.first_seen),
    brokenBacklinks: num(i.broken_backlinks),
  }),
  pages: (i, n) => ({
    id: String(n),
    url: str(i.page || i.url),
    backlinks: num(i.backlinks),
    referringDomains: num(i.referring_domains),
    rank: num(i.rank),
    brokenBacklinks: num(i.broken_backlinks),
  }),
};
// Merges the per-competitor replies: one row per linking site with the competitors it links to.
function gap(replies, spec) {
  const by = new Map();
  replies.forEach((reply, i) => {
    const rival = spec.competitors[i];
    for (const item of page(reply)?.items || []) {
      const link = item?.domain_intersection?.['1'] || {};
      const domain = str(link.domain || item.domain || link.target)
        .toLowerCase()
        .replace(/^www\./, '');
      if (!domain || domain === rival) continue;
      const row = by.get(domain) || {
        domain,
        competitors: [],
        rank: null,
        backlinks: 0,
        spam: null,
        firstSeen: null,
      };
      row.competitors.push(rival);
      row.rank = Math.max(row.rank ?? 0, num(link.rank ?? item.rank) ?? 0);
      row.backlinks += num(link.backlinks) ?? 0;
      const spam = num(link.backlinks_spam_score ?? item.backlinks_spam_score);
      if (spam !== null) row.spam = Math.max(row.spam ?? 0, spam);
      const first = day(link.first_seen);
      if (first && (!row.firstSeen || first < row.firstSeen))
        row.firstSeen = first;
      by.set(domain, row);
    }
  });
  return [...by.values()]
    .sort(
      (a, b) =>
        b.competitors.length - a.competitors.length ||
        (b.rank ?? 0) - (a.rank ?? 0) ||
        a.domain.localeCompare(b.domain),
    )
    .map((row, n) => ({ id: String(n), ...row }));
}
function result(raw, spec) {
  const replies = spec.requests ? raw : [raw];
  const base = {
    taskId: str(replies[0]?.tasks?.[0]?.id),
    costUsd: cost(replies),
  };
  const failed = replies.map(failure).find(Boolean);
  if (failed)
    return { ...base, status: 'failed', errorCode: failed, result: null };
  if (spec.view === 'gap') {
    const items = gap(replies, spec);
    return {
      ...base,
      status: 'completed',
      errorCode: null,
      result: {
        items,
        totalCount: null,
        summary: null,
        // How many sites each competitor has that we lack, as the provider counts them.
        perCompetitor: spec.competitors.map((c, i) => ({
          domain: c,
          total: num(page(replies[i])?.total_count),
        })),
      },
    };
  }
  if (spec.view === 'overview') {
    const s = page(replies[0]) || {};
    return {
      ...base,
      status: 'completed',
      errorCode: null,
      result: {
        summary: summary(s),
        history: replies[1] ? history(page(replies[1])?.items) : [],
        items: [],
        totalCount: null,
      },
    };
  }
  const p = page(replies[0]);
  if (p && p.items !== null && p.items !== undefined && !Array.isArray(p.items))
    return {
      ...base,
      status: 'failed',
      errorCode: 'research_schema_invalid',
      result: null,
    };
  const items = (p?.items || []).map(rows[spec.view]);
  return {
    ...base,
    status: 'completed',
    errorCode: null,
    result: { items, totalCount: num(p?.total_count), summary: null },
  };
}
class BacklinksService {
  constructor(p) {
    this.p = p;
    this.d4s = new DataForSeo(p, { backlinks: { specification, result } });
  }
  run(id, v) {
    return this.d4s.run(id, 'backlinks', v);
  }
  // Recent lookups: the overview runs, newest first, with the counts the list shows.
  async list(id) {
    return (
      await this.d4s
        .repo()
        .find({ filter: { projectId: id }, sort: '-createdAt', limit: 200 })
    )
      .filter((r) => r.get('spec')?.kind === 'backlinks')
      .slice(0, 60)
      .map((r) => {
        const s = r.get('result')?.summary;
        return {
          id: String(r.id),
          status: r.get('status'),
          spec: r.get('spec'),
          createdAt: r.get('createdAt'),
          completedAt: r.get('completedAt') || null,
          errorCode: r.get('errorCode') || null,
          count: r.get('result')?.items?.length ?? null,
          summary: s
            ? {
                rank: s.rank ?? null,
                backlinks: s.backlinks ?? null,
                referringDomains: s.referringDomains ?? null,
              }
            : null,
        };
      });
  }
  async getRun(id, v) {
    const r = await this.d4s
      .repo()
      .findOne({ filter: { id: String(v.runId), projectId: id } });
    if (!r || r.get('spec')?.kind !== 'backlinks')
      error(systemMessageText('domain.queryRecordNotFound'), 404);
    return r.toJSON();
  }
  // What the lookups start from: our site and the competitors listed on Competitors (by their websites).
  async sites(id) {
    const project = await this.p.project(id);
    const bare = (d) =>
      String(d || '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[/:].*$/, '');
    const state = await this.p.competitors?.state?.(id).catch(() => null);
    return {
      own: [...new Set((project?.domains || []).map(bare).filter(Boolean))],
      competitors: (state?.list || [])
        .filter((c) => c.site)
        .map((c) => ({ name: c.name || bare(c.site), domain: bare(c.site) })),
    };
  }
  /** The latest completed lookup of a view for a target (and, for a gap, the same competitors), saved or none. */
  async saved(id, v) {
    const want = specification(v);
    const rows = await this.d4s.repo().find({
      filter: { projectId: id, status: 'completed' },
      sort: '-createdAt',
      limit: 300,
    });
    const row = rows.find((r) => {
      const s = r.get('spec');
      return (
        s?.kind === 'backlinks' &&
        s.view === want.view &&
        s.target === want.target &&
        (want.view !== 'gap' ||
          JSON.stringify(s.competitors) === JSON.stringify(want.competitors))
      );
    });
    return row ? row.toJSON() : null;
  }
  register() {
    const wrap = (fn) => async (ctx, next) => {
      await requireAccess(ctx);
      ctx.set('Cache-Control', 'no-store');
      try {
        if (ctx.method !== 'POST')
          error(systemMessageText('aiSearch.usePost'), 405);
        const v = ctx.action.params.values || {},
          id = projectId(v.projectId);
        await this.p.project(id);
        ctx.body = await fn(id, v, ctx);
        await next();
      } catch (e) {
        if (!(e instanceof VisibilityError))
          ctx.logger.warn('NocoReach backlinks local failure', {
            errorName: e.name,
          });
        ctx.throw(
          e instanceof VisibilityError ? e.status : 502,
          e instanceof VisibilityError
            ? e.message
            : systemMessageText('backlinks.lookupNotComplete'),
        );
      }
    };
    const actions = {
      run: wrap((id, v) => this.run(id, v)),
      list: wrap((id) => this.list(id)),
      getRun: wrap((id, v) => this.getRun(id, v)),
      sites: wrap((id) => this.sites(id)),
    };
    this.p.app.resourceManager.define({ name: 'nrBacklinks', actions });
    this.p.app.acl.allow('nrBacklinks', Object.keys(actions), 'loggedIn');
  }
}
export { BacklinksService, specification, result, target, since, rivals };
