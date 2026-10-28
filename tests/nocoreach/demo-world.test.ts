// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { demoContent } from '../../server/nocoreach/demo-data/content';
import { worldResponse } from '../../server/nocoreach/demo-data/world';
import { World } from '../../server/nocoreach/demo-data/world/world';
import {
  compare,
  type Partition,
} from '../../server/nocoreach/execution/effect';

const now = Date.parse('2026-10-28T12:00:00Z');

describe.each(['zh-CN', 'en-US'])(
  'the complete %s demo edition',
  (language) => {
    const content = demoContent(language);
    it('gives both projects distinct, linked stories and every result state without real product branding', () => {
      expect(JSON.stringify(content)).not.toMatch(/nocobase|nococrm/i);
      for (const which of ['main', 'second'] as const) {
        const project = content.projects[which];
        const world = new World({ id: which, ...project, language }, now);
        const stories =
          which === 'main' ? content.stories : content.secondTasks;
        const opportunities =
          which === 'main'
            ? content.opportunities
            : content.secondOpportunities!;
        const documents =
          which === 'main' ? content.documents : content.secondDocuments!;
        expect(stories.length).toBeGreaterThanOrEqual(20);
        expect(new Set(stories.map((s) => s.key)).size).toBe(stories.length);
        expect(new Set(stories.map((s) => s.state))).toEqual(
          new Set(['todo', 'doing', 'review', 'done']),
        );
        expect(
          new Set(
            stories
              .filter((s) => s.state === 'done' && !s.archived)
              .map((s) => s.outcome),
          ),
        ).toEqual(
          new Set(['up', 'down', 'flat', 'insufficient', 'waiting', undefined]),
        );
        expect(stories.some((s) => s.rejected)).toBe(true);
        expect(stories.some((s) => s.cancelled)).toBe(true);
        expect(stories.some((s) => s.archived)).toBe(true);
        for (const story of stories) {
          expect(
            world.page(story.path),
            `${which}: ${story.key}: ${story.path}`,
          ).toBeDefined();
          if (story.age)
            expect(world.page(story.path)!.published).toBeGreaterThan(
              story.age,
            );
          expect(story.comments.length).toBeGreaterThanOrEqual(1);
          expect(story.brief).toContain(
            language === 'en-US' ? 'Acceptance criteria' : '验收条件',
          );
          expect(story.caseStudy.document.length).toBeGreaterThan(
            language === 'en-US' ? 700 : 220,
          );
          if (story.state === 'done' || story.state === 'review') {
            expect(story.draft).toContain(story.caseStudy.document);
            expect(story.draft).not.toBe(story.brief);
          }
          if (story.previousDraft) {
            expect(story.previousDraft.length).toBeGreaterThan(
              language === 'en-US' ? 500 : 180,
            );
            expect(story.previousDraft).toContain(
              language === 'en-US' ? 'Open review issues' : '初稿待复核',
            );
            expect(story.draft).not.toContain(story.previousDraft);
          }
        }
        expect(documents.length).toBeGreaterThanOrEqual(8);
        expect(opportunities.briefs).toHaveLength(which === 'main' ? 16 : 12);
        expect(opportunities.watches).toHaveLength(6);
        for (const brief of opportunities.briefs)
          expect(world.page(brief[6])).toBeDefined();
        expect(world.queries.length).toBeGreaterThanOrEqual(50);
        expect(world.research.length).toBeGreaterThanOrEqual(40);
        for (const query of world.queries)
          expect(world.page(query.path)).toBeDefined();
        for (const question of world.aiQuestions)
          for (const path of question.cites)
            expect(world.page(path)).toBeDefined();
        for (const page of world.site.pages)
          for (const path of page.links ?? [])
            expect(
              Boolean(world.page(path) || world.site.missing?.includes(path)),
            ).toBe(true);
        for (const source of world.analytics.sources)
          for (const [path] of source.lands ?? [])
            expect(world.page(path)).toBeDefined();
        const script = JSON.stringify({
          site: world.site,
          repository: world.repository,
          forum: world.forum,
          media: world.youtube,
          questions: world.aiQuestions,
        });
        expect(script).not.toMatch(/nocobase|nococrm/i);
      }
      expect(content.secondTasks.map((s) => s.title)).not.toEqual(
        content.stories.slice(0, 20).map((s) => s.title),
      );
    });

    it('connects the ACME import opportunity to recent unanswered customer questions', () => {
      const world = new World(
        { id: 'main', ...content.projects.main, language },
        now,
      );
      const imports = world.forum.topics.filter((topic) =>
        topic.tags?.includes('excel-import'),
      );
      expect(imports).toHaveLength(5);
      expect(imports.every((topic) => topic.opened <= 14)).toBe(true);
      expect(imports.filter((topic) => topic.posts.length === 1)).toHaveLength(
        3,
      );
      expect(content.opportunities.briefs[0][6]).toBe('/docs/import-excel');
      const query = world.queries.find(
        (q) =>
          q.q ===
          (language === 'en-US'
            ? 'project management software'
            : '项目管理软件'),
      );
      expect(query).toMatchObject({ path: '/', position: 6, rank: { by: -5 } });
      expect(JSON.stringify(world.site)).not.toMatch(
        /low.code|no.code|低代码|数据建模/i,
      );
      expect(world.competitors.map((c) => c.domain)).toEqual([
        'nimbus.example',
        'tasks.example',
      ]);
    });

    it('keeps CRM sources and GitHub scoped to CRM, offline and in the imported language', async () => {
      const project = {
        id: 'crm-project',
        ...content.projects.second,
        language,
      };
      const network = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Unexpected live network'));
      try {
        const html = await (
          await worldResponse(
            project,
            'https://crm.acme.example/docs/lead-routing',
            {},
            now,
          )
        ).text();
        expect(html).toContain(
          language === 'en-US' ? 'Lead routing' : '线索分配',
        );
        expect(html).not.toContain('https://acme.example/');
        const forum = await (
          await worldResponse(
            project,
            'https://community.crm.acme.example/latest.json',
            {},
            now,
          )
        ).json();
        expect(forum.topic_list.topics.length).toBeGreaterThan(10);
        const issues = await (
          await worldResponse(
            project,
            'https://api.github.com/repos/acme/crm/issues?state=all&per_page=100',
            {},
            now,
          )
        ).json();
        expect(issues.length).toBeGreaterThan(10);
        expect(JSON.stringify(issues)).toContain(
          language === 'en-US' ? 'quote' : '报价',
        );
        const wrongRepo = await worldResponse(
          project,
          'https://api.github.com/repos/acme/acme',
          {},
          now,
        );
        expect(wrongRepo.status).toBe(404);
        await expect(
          worldResponse(project, 'https://outside.invalid/', {}, now),
        ).rejects.toThrow();
        expect(network).not.toHaveBeenCalled();
      } finally {
        network.mockRestore();
      }
    });

    it('keeps daily analytics totals consistent and exposes different movements', () => {
      for (const which of ['main', 'second'] as const) {
        const world = new World(
          { id: which, ...content.projects[which], language },
          now,
        );
        const date = '2026-10-26';
        const visits = world.visitsOn(date);
        const total = visits.reduce((sum, item) => sum + item.sessions, 0);
        expect(total).toBeGreaterThan(0);
        expect(Math.abs(total - world.sessionsOn(date))).toBeLessThanOrEqual(1);
        expect(world.visitsOn(date)).toEqual(visits);
        const changes = world.site.pages.flatMap((p) => p.changes ?? []);
        expect(changes.some((c) => c.kind === 'step' && c.to > 1)).toBe(true);
        expect(changes.some((c) => c.kind === 'step' && c.to < 1)).toBe(true);
        expect(changes.some((c) => c.kind === 'launch')).toBe(true);
      }
    });

    it.each([
      ['main', '/docs/guests', 'up'],
      ['second', '/pricing', 'down'],
    ] as const)(
      'measures %s %s from source data in either language',
      async (which, path, conclusion) => {
        const project = { id: which, ...content.projects[which], language };
        const response = await worldResponse(
          project,
          `https://www.googleapis.com/webmasters/v3/sites/sc-domain%3A${project.domain}/searchAnalytics/query`,
          {
            method: 'POST',
            body: JSON.stringify({
              startDate: '2026-10-07',
              endDate: '2026-10-21',
              dimensions: ['date', 'query', 'page'],
              rowLimit: 25000,
            }),
          },
          now,
        );
        const data = (await response.json()) as {
          rows: {
            keys: string[];
            clicks: number;
            impressions: number;
            position: number;
          }[];
        };
        const dates = new Map<string, Partition>();
        for (const row of data.rows) {
          const [date, keyword, page] = row.keys;
          if (!dates.has(date))
            dates.set(date, {
              date,
              source: 'gsc',
              grain: 'query_page',
              payload: [],
            });
          dates.get(date)!.payload.push({
            keyword,
            page,
            clicks: row.clicks,
            impressions: row.impressions,
            position: row.position,
          });
        }
        const effect = compare(
          7,
          '2026-10-14',
          [`https://${project.domain}${path}`],
          [...dates.values()],
          '2026-10-24T12:00:00Z',
        );
        expect(effect.coverage?.gsc).toEqual({ baselineDays: 7, afterDays: 7 });
        expect(effect.conclusion).toBe(conclusion);
        expect(
          Math.abs(effect.gsc!.clicks[0] - effect.gsc!.clicks[1]),
        ).toBeGreaterThanOrEqual(10);
      },
    );
  },
);
