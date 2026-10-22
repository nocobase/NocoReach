import { describe, expect, test } from 'vitest';

import {
  worldGoogle,
  worldResponse,
} from '../../server/nocoreach/demo-data/world/index.js';

const NOW = Date.parse('2026-10-22T09:30:00Z');
const project = (language: string, domain = 'nocobase.example') => ({
  id: '1',
  name: 'NocoBase',
  domain,
  language,
});
const call = async (
  language: string,
  url: string,
  body?: unknown,
  domain?: string,
) => {
  const response = await worldResponse(
    project(language, domain),
    url,
    body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) },
    NOW,
  );
  return {
    status: response.status,
    body: (await response
      .clone()
      .json()
      .catch(() => response.text())) as any,
  };
};

describe('demo world', () => {
  test('GA4 reports of the same days add up to the same sessions', async () => {
    const { ga4PropertyId } = worldGoogle(project('zh-CN'), NOW);
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${ga4PropertyId}:runReport`;
    const range = [{ startDate: '28daysAgo', endDate: 'yesterday' }];
    const overview = await call('zh-CN', url, {
      dateRanges: range,
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }],
    });
    const bySource = await call('zh-CN', url, {
      dateRanges: range,
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'country' },
        { name: 'deviceCategory' },
      ],
      metrics: [{ name: 'sessions' }],
    });
    const sum = (rows: any[]) =>
      rows.reduce((n, r) => n + Number(r.metricValues[0].value), 0);
    expect(overview.body.rows).toHaveLength(28);
    expect(sum(overview.body.rows)).toBe(sum(bySource.body.rows));
    // Weekends are quieter than weekdays.
    const days = overview.body.rows.map((r: any) => [
      r.dimensionValues[0].value,
      Number(r.metricValues[0].value),
    ]);
    const weekend = days.filter(([d]: [string]) =>
      [0, 6].includes(
        new Date(
          `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T00:00:00Z`,
        ).getUTCDay(),
      ),
    );
    const weekday = days.filter((d: unknown) => !weekend.includes(d));
    const mean = (rows: [string, number][]) =>
      rows.reduce((n, [, v]) => n + v, 0) / rows.length;
    expect(mean(weekend)).toBeLessThan(mean(weekday) * 0.8);
    const sources = new Set(
      bySource.body.rows.map((r: any) => r.dimensionValues[1].value),
    );
    expect(sources).toContain('baidu');
  });

  test('Search Console answers in the demo language with many queries and the scripted moves', async () => {
    const site = encodeURIComponent('sc-domain:nocobase.example');
    const url = `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`;
    const zh = await call('zh-CN', url, {
      startDate: '2026-09-20',
      endDate: '2026-10-19',
      dimensions: ['query'],
      rowLimit: 25000,
    });
    const en = await call('en-US', url, {
      startDate: '2026-09-20',
      endDate: '2026-10-19',
      dimensions: ['query'],
      rowLimit: 25000,
    });
    expect(zh.body.rows.length).toBeGreaterThan(80);
    expect(zh.body.rows.some((r: any) => /[一-鿿]/.test(r.keys[0]))).toBe(true);
    expect(en.body.rows.every((r: any) => !/[一-鿿]/.test(r.keys[0]))).toBe(
      true,
    );
    // The opportunity's numbers: about 2,140 impressions and 43 clicks for the Chinese data-permission query over 28 days.
    const last28 = await call('zh-CN', url, {
      startDate: '2026-09-23',
      endDate: '2026-10-20',
      dimensions: ['query'],
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: 'query',
              operator: 'equals',
              expression: 'crm 数据权限',
            },
          ],
        },
      ],
    });
    const [row] = last28.body.rows;
    expect(row.impressions).toBeGreaterThan(1700);
    expect(row.impressions).toBeLessThan(2600);
    expect(row.clicks).toBeGreaterThan(25);
    expect(row.clicks).toBeLessThan(65);
    // The charts guide lost position twelve days ago while its impressions grew.
    const chart = async (start: string, end: string) =>
      (
        await call('zh-CN', url, {
          startDate: start,
          endDate: end,
          dimensions: ['page'],
          dimensionFilterGroups: [
            {
              filters: [
                {
                  dimension: 'page',
                  operator: 'equals',
                  expression: 'https://nocobase.example/docs/reporting',
                },
              ],
            },
          ],
        })
      ).body.rows[0];
    const before = await chart('2026-09-26', '2026-10-07');
    const after = await chart('2026-10-08', '2026-10-19');
    expect(after.impressions).toBeGreaterThan(before.impressions);
    expect(after.position).toBeGreaterThan(before.position + 1.5);
    expect(after.clicks).toBeLessThan(before.clicks);
  });

  test('the site, forum and repository speak the imported language', async () => {
    const zhPage = await call(
      'zh-CN',
      'https://nocobase.example/docs/permissions',
    );
    const enPage = await call(
      'en-US',
      'https://nocobase.example/docs/permissions',
    );
    expect(zhPage.body).toContain('角色与权限');
    expect(enPage.body).toContain('Roles and permissions');
    const sitemap = await call(
      'zh-CN',
      'https://nocobase.example/sitemap-docs.xml',
    );
    expect((sitemap.body.match(/<url>/g) ?? []).length).toBeGreaterThan(20);
    expect(sitemap.body).not.toContain('/docs/installation/kubernetes');
    expect(
      (await call('zh-CN', 'https://nocobase.example/docs/import-data')).status,
    ).toBe(404);
    const latest = await call(
      'zh-CN',
      'https://community.nocobase.example/latest.json',
    );
    expect(latest.body.topic_list.topics.length).toBeGreaterThan(25);
    expect(latest.body.topic_list.topics[0].pinned).toBe(true);
    const issues = await call(
      'en-US',
      'https://api.github.com/repos/nocobase/nocobase/issues?state=all&per_page=100',
    );
    expect(issues.body.length).toBeGreaterThan(50);
    expect(issues.body.some((i: any) => i.pull_request?.merged_at)).toBe(true);
    expect(
      issues.body.some((i: any) => i.state === 'open' && !i.pull_request),
    ).toBe(true);
    const zhIssues = await call(
      'zh-CN',
      'https://api.github.com/repos/nocobase/nocobase/issues?state=all&per_page=5',
    );
    expect(zhIssues.body.some((i: any) => /[一-鿿]/.test(i.title))).toBe(true);
  });

  test('star history adds up to the repository total', async () => {
    const repo = await call(
      'en-US',
      'https://api.github.com/repos/nocobase/nocobase',
    );
    const weeks = [];
    for (let page = 1; page < 10; page++) {
      const batch = (
        await call(
          'en-US',
          `https://api.github.com/repos/nocobase/nocobase/stargazers/history?per_page=30&page=${page}`,
        )
      ).body;
      weeks.push(...batch);
      if (batch.length < 30) break;
    }
    const total = weeks.reduce(
      (n: number, w: any) =>
        n + w.days.reduce((a: number, b: number) => a + b, 0),
      0,
    );
    expect(total).toBe(repo.body.stargazers_count);
  });

  test('the second project has its own small site and no developer communities', async () => {
    const page = await call(
      'en-US',
      'https://nococrm.example/',
      undefined,
      'nococrm.example',
    );
    expect(page.body).toContain('NocoCRM');
    await expect(
      worldResponse(
        project('en-US', 'nococrm.example'),
        'https://community.nococrm.example/latest.json',
        {},
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'demo_world_unsupported' });
  });
});
