// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NocoBaseArticles } from '../../server/nocoreach/articles/nocobase-api';
import {
  CMS_ARTICLES,
  demoCmsTarget,
} from '../../server/nocoreach/demo-data/cms-article';
import { worldResponse } from '../../server/nocoreach/demo-data/world';
import type { NocoBaseTarget } from '../../shared/article-publishing';

const now = Date.parse('2026-11-12T12:00:00Z');

// The demo's blog CMS (2026-11-12) holds what its article tasks pushed, read through the real provider: the waiting task's
// 30-minute check finds its draft still a draft, the published one published, the deleted one gone, and the target's
// Test connection succeeds.
const [waiting, published, deleted] = (
  ['draft', 'published', 'deleted'] as const
).map((state) => CMS_ARTICLES.find((a) => a.state === state)!);
describe.each([
  ['zh-CN', 'zh'],
  ['en-US', 'en'],
] as const)('the %s demo CMS', (language, lang) => {
  const project = { id: '1', domain: 'acme.example', language };
  const cms = new NocoBaseArticles(
    demoCmsTarget('acme.example', lang) as NocoBaseTarget,
    'demo-only-cms-api-key',
    (url, init) => worldResponse(project, url, init, now),
  );

  it('answers reads of the waiting draft and the published post, and not the deleted draft', async () => {
    for (const [a, status] of [
      [waiting, 'draft'],
      [published, 'published'],
    ] as const) {
      const post = await cms.get(String(a.id));
      expect(post).toMatchObject({
        id: String(a.id),
        slug: a.slug,
        status,
        locales: { [lang]: { title: a.title[lang] } },
      });
      expect(post.locales[lang].body).toContain(a.verifyText[lang]);
      expect(await cms.findBySlug(a.slug)).toMatchObject({ id: String(a.id) });
    }
    await expect(cms.get(String(deleted.id))).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(await cms.findBySlug(deleted.slug)).toBeNull();
    expect((await cms.search('', 20)).map((a) => a.slug).sort()).toEqual(
      [waiting.slug, published.slug].sort(),
    );
    expect(await cms.search(published.title[lang].slice(0, 6), 20)).toEqual([
      expect.objectContaining({ id: String(published.id) }),
    ]);
  });

  it('gives each task its own article, title and comment', () => {
    for (const key of ['slug', 'id'] as const)
      expect(new Set(CMS_ARTICLES.map((a) => a[key])).size).toBe(3);
    for (const pick of [
      (a) => a.title[lang],
      (a) => a.task.title[lang],
      (a) => a.task.comment.text[lang],
      (a) => a.task.comment.person,
    ])
      expect(new Set(CMS_ARTICLES.map(pick)).size).toBe(3);
  });

  it('takes no writes, and only the main site has one', async () => {
    await expect(
      cms.update(
        String(waiting.id),
        { locales: { [lang]: { title: 'x' } } },
        { baseVersion: 'v', key: 'k' },
      ),
    ).rejects.toThrow();
    await expect(
      worldResponse(
        { id: '2', domain: 'crm.acme.example', language },
        'https://cms.crm.acme.example/api/posts:list',
        {},
        now,
      ),
    ).rejects.toThrow(/does not answer/);
  });
});
