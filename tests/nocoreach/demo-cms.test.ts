// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NocoBaseArticles } from '../../server/nocoreach/articles/nocobase-api';
import {
  CMS_DRAFT,
  demoCmsTarget,
} from '../../server/nocoreach/demo-data/cms-article';
import { worldResponse } from '../../server/nocoreach/demo-data/world';
import type { NocoBaseTarget } from '../../shared/article-publishing';

const now = Date.parse('2026-11-12T12:00:00Z');

// The demo's blog CMS (2026-11-12) holds the draft its article task waits on, read through the real provider, so the
// task's 30-minute check finds it still a draft and the target's Test connection succeeds.
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

  it('answers reads of the waiting draft', async () => {
    const draft = await cms.get(String(CMS_DRAFT.id));
    expect(draft).toMatchObject({
      id: String(CMS_DRAFT.id),
      slug: CMS_DRAFT.slug,
      status: 'draft',
      locales: { [lang]: { title: CMS_DRAFT.title[lang] } },
    });
    expect(draft.locales[lang].body).toContain(CMS_DRAFT.verifyText[lang]);
    expect(await cms.findBySlug(CMS_DRAFT.slug)).toMatchObject({
      id: String(CMS_DRAFT.id),
    });
    expect(await cms.findBySlug('another-post')).toBeNull();
    expect(await cms.search('', 20)).toHaveLength(1);
    await expect(cms.get('999')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('takes no writes, and only the main site has one', async () => {
    await expect(
      cms.update(
        String(CMS_DRAFT.id),
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
