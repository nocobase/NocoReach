// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import appRuntime from '../../server/runtime';
import { demoContent } from '../../server/nocoreach/demo-data/content';
import { worldResponse } from '../../server/nocoreach/demo-data/world';
import { World } from '../../server/nocoreach/demo-data/world/world';
import { KeywordDetail, kinds } from '../../server/nocoreach/keyword-detail';
import { specification } from '../../server/nocoreach/keyword-policy';
import { getMarkets, marketLabel } from '../../client/pages/keyword-api';

const now = Date.parse('2026-10-29T12:00:00Z');

describe.each(['zh-CN', 'en-US'])(
  'complete %s demo keyword data',
  (language) => {
    it.each(['main', 'second'] as const)(
      'keeps every %s research phrase complete and consistent',
      async (which) => {
        const project = {
          id: which,
          ...demoContent(language).projects[which],
          language,
        };
        const world = new World(project, now);
        const market =
          language === 'en-US'
            ? { locationCode: 2840, language: 'en' }
            : { locationCode: 2158, language: 'zh-TW' };
        expect(getMarkets()).toContainEqual({
          ...market,
          label: marketLabel(market),
        });
        expect(marketLabel(market)).not.toMatch(/2158|2840/);
        specification({
          view: 'related',
          target: world.research[0].keyword,
          limit: 100,
          ...market,
        });
        const detail = new KeywordDetail({});
        detail.d4s = {
          config: () => ({ verifiedAt: new Date(now).toISOString() }),
          run: async (_id: string, kind: keyof typeof kinds, input: object) => {
            const spec = kinds[kind].specification(input);
            const response = await worldResponse(
              project,
              `https://api.dataforseo.com/v3/${spec.path}`,
              { method: 'POST', body: JSON.stringify([spec.request]) },
              now,
            );
            return kinds[kind].result(await response.json(), spec);
          },
        };
        expect(world.research.length).toBeGreaterThan(45);
        expect(
          new Set(world.research.map((k) => k.keyword.toLowerCase())).size,
        ).toBe(world.research.length);
        for (const keyword of world.research) {
          expect(keyword.keyword).not.toMatch(
            /project management .* (guide|template|common questions)$|项目管理 .* (指南|模板|常见问题)$/i,
          );
          if (language === 'en-US')
            expect(keyword.keyword).not.toMatch(/\p{Script=Han}/u);
          const input = { keyword: keyword.keyword, ...market };
          const result = await detail.market(project.id, input);
          expect(result.overview.status).toBe('ready');
          expect(result.overview.item).toMatchObject({
            volume: keyword.volume,
            difficulty: keyword.difficulty,
            cpc: keyword.cpc,
          });
          expect(result.overview.item.monthlySearches).toHaveLength(12);
          expect(
            result.overview.item.monthlySearches.every(
              (m: { volume: number }) => m.volume > 0,
            ),
          ).toBe(true);
          for (const group of ['related', 'matching', 'questions'])
            expect(
              result.related[group].length,
              `${keyword.keyword}: ${group}`,
            ).toBeGreaterThan(0);
          const seed = keyword.keyword.toLowerCase();
          expect(
            result.related.matching.every((k: { keyword: string }) =>
              k.keyword.toLowerCase().includes(seed),
            ),
          ).toBe(true);
          const all = [
            ...result.related.related,
            ...result.related.matching,
          ].map((k) => k.keyword.toLowerCase());
          expect(new Set(all).size).toBe(all.length);
          const words = seed.split(/\s+/);
          expect(
            world.queries.some(
              (q) =>
                q.q.toLowerCase() !== seed &&
                words.every((word) => q.q.toLowerCase().includes(word)),
            ),
          ).toBe(true);
          const serp = await detail.lookup(project.id, 'kw-serp', input);
          expect(serp.status).toBe('ready');
          expect(serp.items).toHaveLength(10);
          expect(serp.questions.length).toBeGreaterThan(0);
          expect(serp.related.length).toBeGreaterThan(0);
          if (keyword.position && keyword.position <= 10)
            expect(
              serp.items.find((item) => item.domain === project.domain)
                ?.position,
            ).toBe(Math.round(keyword.position));
        }
        for (const view of ['suggestions', 'related', 'ideas'] as const) {
          const spec = specification({
            view,
            target: world.research[0].keyword,
            limit: 100,
            ...market,
          });
          const response = await worldResponse(
            project,
            `https://api.dataforseo.com/v3/${spec.path}`,
            { method: 'POST', body: JSON.stringify([spec.request]) },
            now,
          );
          expect(
            (await response.json()).tasks[0].result[0].items.length,
          ).toBeGreaterThan(0);
        }
      },
    );
  },
);

it('keeps keyword caching writable by default and preserves environment exceptions', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'demo-keyword-config-'));
  const configPath = path.join(directory, 'config.yml');
  await writeFile(configPath, '{}');
  try {
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      configPath,
      rootDir: process.cwd(),
      env: {
        NOCOBASE_DEMO_WRITABLE_COLLECTIONS: 'nrSnapshots,nrTasks',
      },
    });
    expect(runtime.config.get('demoMode.allowCollections')).toEqual([
      'nrKeywordRuns',
      'nrSnapshots',
      'nrTasks',
    ]);
    expect(runtime.config.publicValues().demoMode).toEqual({ enabled: false });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
