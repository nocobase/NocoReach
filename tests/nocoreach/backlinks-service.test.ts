import { describe, expect, it } from 'vitest';
import {
  BacklinksService,
  result,
  since,
  specification,
  target,
} from '../../server/nocoreach/backlinks-service.js';

const ok = (items: unknown, extra = {}) => ({
  status_code: 20000,
  cost: 0.0276,
  tasks: [
    {
      id: 'task-1',
      status_code: 20000,
      result: [{ total_count: 1200, items, ...extra }],
    },
  ],
});

describe('backlinks lookups', () => {
  it('takes a site or one exact page', () => {
    expect(target('https://www.Example.com/')).toEqual({
      target: 'example.com',
      scope: 'domain',
    });
    expect(target('example.com/blog/post')).toEqual({
      target: 'https://example.com/blog/post',
      scope: 'page',
    });
    expect(target('http://www.example.com/a')).toEqual({
      target: 'http://www.example.com/a',
      scope: 'page',
    });
    expect(() => target('https://example.com/a?x=1')).toThrow(/\?/);
    expect(() => target('not a domain')).toThrow(/域名/);
  });

  it('reads a site overview as summary plus a year of monthly history, on the 0-100 scale', () => {
    const spec = specification({ view: 'overview', target: 'example.com' });
    expect(spec.requests.map((r: { path: string }) => r.path)).toEqual([
      'backlinks/summary/live',
      'backlinks/history/live',
    ]);
    expect(spec.requests[0].body).toMatchObject({
      target: 'example.com',
      include_subdomains: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: 'live',
      rank_scale: 'one_hundred',
    });
    expect(spec.requests[1].body).toEqual({
      target: 'example.com',
      date_from: since(),
      rank_scale: 'one_hundred',
    });
    expect(spec.reservationUsd).toBeGreaterThanOrEqual(spec.estimatedUsd);
    // A page has no history; the same month keeps the same specification, so the lookup is reused.
    expect(
      specification({ view: 'overview', target: 'example.com/a' }).requests,
    ).toHaveLength(1);
    expect(since(new Date('2026-11-30T23:00:00Z'))).toBe('2025-11-01');
  });

  it('reads 100 rows per tab, unfiltered by spam, and refuses top pages of a single page', () => {
    const links = specification({ view: 'links', target: 'example.com' });
    expect(links.path).toBe('backlinks/backlinks/live');
    expect(links.request).toMatchObject({
      limit: 100,
      mode: 'one_per_domain',
      order_by: ['rank,desc'],
    });
    expect(links.request.filters).toBeUndefined();
    expect(specification({ view: 'domains', target: 'example.com' }).path).toBe(
      'backlinks/referring_domains/live',
    );
    expect(specification({ view: 'pages', target: 'example.com' }).path).toBe(
      'backlinks/domain_pages_summary/live',
    );
    expect(() =>
      specification({ view: 'pages', target: 'example.com/a' }),
    ).toThrow(/热门页面/);
    expect(() =>
      specification({ view: 'gap', target: 'example.com' }),
    ).toThrow();
  });

  it('maps both spellings of referring-domain counts and the fields the tables show', () => {
    const spec = specification({ view: 'overview', target: 'example.com' });
    const parsed = result(
      [
        ok(undefined, {
          rank: 41,
          backlinks: 18420,
          referring_domains: 1284,
          referring_pages: 9310,
          broken_backlinks: 86,
          backlinks_spam_score: 6,
          info: { target_spam_score: 3 },
        }),
        ok([
          {
            date: '2026-10-01 00:00:00 +00:00',
            backlinks: 2,
            new_reffering_domains: 4,
          },
          {
            date: '2026-09-01 00:00:00 +00:00',
            backlinks: 1,
            new_referring_domains: 3,
          },
        ]),
      ],
      spec,
    );
    expect(parsed).toMatchObject({ status: 'completed', costUsd: 0.0552 });
    expect(parsed.result.summary).toMatchObject({
      rank: 41,
      referringPages: 9310,
      targetSpam: 3,
    });
    expect(
      parsed.result.history.map(
        (h: { date: string; newReferringDomains: number }) => [
          h.date,
          h.newReferringDomains,
        ],
      ),
    ).toEqual([
      ['2026-09-01', 3],
      ['2026-10-01', 4],
    ]);
    const links = result(
      ok([
        {
          url_from: 'https://a.example/x',
          domain_from: 'a.example',
          url_to: 'https://example.com/',
          dofollow: false,
          domain_from_rank: 30,
          backlink_spam_score: 55,
          first_seen: '2026-01-02 00:00:00 +00:00',
          lost_date: '2026-10-01 00:00:00 +00:00',
        },
      ]),
      specification({ view: 'links', target: 'example.com' }),
    );
    expect(links.result).toMatchObject({ totalCount: 1200 });
    expect(links.result.items[0]).toMatchObject({
      id: '0',
      dofollow: false,
      domainRank: 30,
      spam: 55,
      firstSeen: '2026-01-02',
      isLost: true,
      lastSeen: '2026-10-01',
    });
  });

  it('names a balance problem and keeps other provider codes', () => {
    const spec = specification({ view: 'links', target: 'example.com' });
    expect(
      result({ status_code: 40210, cost: 0, tasks: [] }, spec),
    ).toMatchObject({ status: 'failed', errorCode: 'backlinks_balance' });
    expect(
      result(
        { status_code: 20000, cost: 0, tasks: [{ status_code: 40501 }] },
        spec,
      ),
    ).toMatchObject({ status: 'failed', errorCode: 'provider_status_40501' });
    // One failed reply fails the whole overview; an unknown cost stays unknown.
    const overview = specification({ view: 'overview', target: 'example.com' });
    expect(
      result(
        [
          ok(undefined),
          { status_code: 20000, tasks: [{ status_code: 40200 }] },
        ],
        overview,
      ),
    ).toMatchObject({
      status: 'failed',
      errorCode: 'backlinks_balance',
      costUsd: null,
    });
  });

  it('lists backlinks runs only and refuses another kind', async () => {
    const rows = [
      {
        id: 1,
        projectId: '1',
        status: 'completed',
        spec: { kind: 'backlinks', view: 'overview', target: 'a.com' },
        result: {
          items: [],
          summary: { rank: 4, backlinks: 5, referringDomains: 2, spam: 1 },
        },
        createdAt: '2026-10-02',
      },
      {
        id: 2,
        projectId: '1',
        status: 'completed',
        spec: { kind: 'domain', view: 'keywords' },
        createdAt: '2026-10-01',
      },
    ];
    const wrap = (r?: Record<string, unknown>) =>
      r && { ...r, get: (k: string) => r[k], toJSON: () => r };
    const repo = {
      find: async () => rows.map(wrap),
      findOne: async (o: { filter: { id: string } }) =>
        wrap(rows.find((r) => String(r.id) === o.filter.id)),
    };
    const service = new BacklinksService({
      env: () => null,
      db: { getRepository: () => repo },
    });
    const list = await service.list('1');
    expect(list.map((r: { id: string }) => r.id)).toEqual(['1']);
    expect(list[0].summary).toEqual({
      rank: 4,
      backlinks: 5,
      referringDomains: 2,
    });
    await expect(service.getRun('1', { runId: 2 })).rejects.toThrow(/不存在/);
  });
});

describe('link gap', () => {
  it('asks once per competitor, without our own site, in a fixed order', () => {
    const spec = specification({
      view: 'gap',
      target: 'https://www.acme.example/',
      competitors: ['www.rival.example', 'other.example', 'rival.example'],
    });
    expect(spec.competitors).toEqual(['other.example', 'rival.example']);
    expect(spec.requests).toHaveLength(2);
    expect(spec.requests[1].body).toMatchObject({
      targets: { 1: 'rival.example' },
      exclude_targets: ['acme.example'],
      backlinks_status_type: 'live',
      rank_scale: 'one_hundred',
      limit: 100,
    });
    expect(spec.reservationUsd).toBeGreaterThanOrEqual(spec.estimatedUsd);
    expect(() =>
      specification({ view: 'gap', target: 'acme.example', competitors: [] }),
    ).toThrow();
    expect(() =>
      specification({
        view: 'gap',
        target: 'acme.example',
        competitors: ['acme.example', 'blog.acme.example'],
      }),
    ).toThrow();
    expect(() =>
      specification({
        view: 'gap',
        target: 'acme.example',
        competitors: ['a.example', 'b.example', 'c.example', 'd.example'],
      }),
    ).toThrow();
    expect(() =>
      specification({
        view: 'gap',
        target: 'acme.example/page',
        competitors: ['a.example'],
      }),
    ).toThrow(/整个网站/);
  });

  it('merges the replies into one row per site with the competitors it links to', () => {
    const spec = specification({
      view: 'gap',
      target: 'acme.example',
      competitors: ['a.example', 'b.example'],
    });
    const reply = (rows: unknown[], total: number) =>
      ok(
        rows.map((r) => ({ domain_intersection: { 1: r } })),
        { total_count: total },
      );
    const parsed = result(
      [
        reply(
          [
            {
              target: 'www.shared.example',
              rank: 30,
              backlinks: 2,
              backlinks_spam_score: 5,
            },
            { target: 'only-a.example', rank: 80, backlinks: 1 },
          ],
          40,
        ),
        reply(
          [
            {
              target: 'shared.example',
              rank: 35,
              backlinks: 4,
              backlinks_spam_score: 9,
            },
          ],
          12,
        ),
      ],
      spec,
    );
    expect(parsed.status).toBe('completed');
    expect(parsed.result.perCompetitor).toEqual([
      { domain: 'a.example', total: 40 },
      { domain: 'b.example', total: 12 },
    ]);
    expect(parsed.result.items).toEqual([
      {
        id: '0',
        domain: 'shared.example',
        competitors: ['a.example', 'b.example'],
        rank: 35,
        backlinks: 6,
        spam: 9,
        firstSeen: null,
      },
      {
        id: '1',
        domain: 'only-a.example',
        competitors: ['a.example'],
        rank: 80,
        backlinks: 1,
        spam: null,
        firstSeen: null,
      },
    ]);
  });
});
