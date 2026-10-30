import { describe, expect, test, vi } from 'vitest';
import {
  ARTICLE_TARGET_PRESETS,
  articleTargetSchema,
  looseSlugFromPage,
  slugFromPage,
  type ArticleTarget,
} from '../../shared/article-publishing.js';
import {
  ArticleDelivery,
  cleanDraft,
  DraftRejected,
  draftRejection,
} from '../../server/nocoreach/articles/delivery.js';
import {
  readFrontmatter,
  writeFrontmatter,
} from '../../server/nocoreach/articles/git-files.js';
import { NocoBaseArticles } from '../../server/nocoreach/articles/nocobase-api.js';
import {
  ArticleError,
  errorDetail,
} from '../../server/nocoreach/articles/provider.js';
import { ArticleTargets } from '../../server/nocoreach/articles/targets.js';
import { networkFailure } from '../../server/nocoreach/outbound-network.js';
import type { LegacyVariables } from '../../server/nocoreach/legacy/variables.js';
import { fakeArticleApi, fakeGitHub, fakeNocoBase } from './article-fakes.js';
import { $legacyText, setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import traditional from '../../shared/i18n/zh-TW.json';

const EXPORTER = { name: 'NocoBase-CMS', email: 'cms@example.com' };
function variables() {
  const values = new Map<string, string>();
  return {
    values,
    get: (k: string) => values.get(k),
    set: async (k: string, v: string | null) =>
      v === null ? values.delete(k) : values.set(k, v),
    cannotRead: () => false,
  } as unknown as LegacyVariables & { values: Map<string, string> };
}
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
async function setup(
  target: ArticleTarget,
  fetchers: { site?: Fetch; github?: Fetch },
  secrets: { secret?: string; gitToken?: string } = {},
) {
  const vars = variables();
  const targets = new ArticleTargets(vars, (_id, connection) => (url, init) => {
    const f = fetchers[connection];
    if (!f) throw new Error(`unexpected ${connection} request ${url}`);
    return f(url, init);
  });
  await targets.save('1', { revision: 0, target, ...secrets });
  return { targets, delivery: new ArticleDelivery(targets), vars };
}
const cmsTarget = (extra: Partial<ArticleTarget> = {}): ArticleTarget =>
  ({
    ...ARTICLE_TARGET_PRESETS['nocobase-api'],
    id: 'cms',
    name: 'CMS',
    baseUrl: 'https://cms.example.com',
    pages: {
      en: 'https://www.example.com/en/blog/{slug}',
      zh: 'https://www.example.com/cn/blog/{slug}',
    },
    ...extra,
  }) as ArticleTarget;
const row = () => ({
  id: 7,
  slug: 'hello',
  status: 'published',
  title: 'Hello',
  description: 'Old summary',
  content: '# Hello\n\nEnglish body',
  title_cn: '你好',
  description_cn: '旧摘要',
  content_cn: '# 你好\n\n中文正文',
  title_ja: '',
  description_ja: '',
  content_ja: '',
  updatedAt: '2026-10-17T00:00:00.000Z',
});
const draft = (
  locales: Record<string, Record<string, string>>,
  extra: Record<string, unknown> = {},
) => ({ locales, ...extra });

describe('NocoBase API target', () => {
  test('maps fields, writes only what changed and keeps a concurrent edit to another field', async () => {
    const cms = fakeNocoBase([row()]);
    const { delivery, targets } = await setup(
      cmsTarget({
        triggerWorkflows: ['refresh-cache'],
      } as Partial<ArticleTarget>),
      { site: cms.fetcher },
      { secret: 'cms-key' },
    );
    const base = await delivery.read('1', 'cms', '7');
    expect(base.locales.zh).toEqual({
      title: '你好',
      description: '旧摘要',
      body: '# 你好\n\n中文正文',
    });
    expect(base.status).toBe('published');
    const p = delivery.proposal('1', {
      targetId: 'cms',
      articleId: '7',
      base,
      baseKey: 'k',
      draft: draft({
        zh: { body: '# 你好\n\n新的中文正文' },
        en: { title: 'Hello' },
      }),
    });
    expect(p.changes).toEqual(['zh.body']);
    // An editor changes the English title in the CMS while the draft is reviewed.
    cms.edit(7, { title: 'Hello, edited in CMS' });
    const out = await delivery.publish('1', p, base, 'key-1');
    expect(out.kind).toBe('published');
    const write = cms.state.requests.find((r) => r.action === 'update')!;
    expect(write.body).toEqual({ content_cn: '# 你好\n\n新的中文正文' });
    expect(write.params.get('triggerWorkflows')).toBe('refresh-cache');
    expect(cms.state.rows[0].title).toBe('Hello, edited in CMS');
    expect(targets.list('1').targets[0]).not.toHaveProperty('secret');
  });

  test('a field changed in the CMS since the base is a conflict and nothing is written', async () => {
    const cms = fakeNocoBase([row()]);
    const { delivery } = await setup(
      cmsTarget(),
      { site: cms.fetcher },
      { secret: 'cms-key' },
    );
    const base = await delivery.read('1', 'cms', '7');
    const p = delivery.proposal('1', {
      targetId: 'cms',
      articleId: '7',
      base,
      baseKey: 'k',
      draft: draft({ zh: { body: 'AI 改写' } }),
    });
    cms.edit(7, { content_cn: '编辑在 CMS 里改的正文' });
    const out = await delivery.publish('1', p, base, 'key-1');
    expect(out).toMatchObject({
      kind: 'conflict',
      reason: 'changed',
      fields: [
        {
          field: 'zh.body',
          base: '# 你好\n\n中文正文',
          current: '编辑在 CMS 里改的正文',
          draft: 'AI 改写',
        },
      ],
    });
    expect(cms.state.requests.some((r) => r.action === 'update')).toBe(false);
  });

  test('a write with an unknown outcome is adopted on retry instead of repeated', async () => {
    for (const failure of ['timeout', '500-after-save'] as const) {
      const cms = fakeNocoBase([row()]);
      const { delivery } = await setup(
        cmsTarget(),
        { site: cms.fetcher },
        { secret: 'cms-key' },
      );
      const base = await delivery.read('1', 'cms', '7');
      const p = delivery.proposal('1', {
        targetId: 'cms',
        articleId: '7',
        base,
        baseKey: 'k',
        draft: draft({ en: { description: 'New summary' } }),
      });
      if (failure === 'timeout') {
        // The request is lost before the CMS saves it: retry writes once.
        cms.state.failNextWrite = 'timeout';
        expect(await delivery.publish('1', p, base, 'key-1')).toEqual({
          kind: 'failed',
          code: 'unknown_outcome',
          step: 'write',
          detail: 'Error: socket hang up',
        });
        expect((await delivery.publish('1', p, base, 'key-1')).kind).toBe(
          'published',
        );
        // The lost request and the retry; only the retry reached the CMS.
        expect(
          cms.state.requests.filter((r) => r.action === 'update'),
        ).toHaveLength(2);
        expect(cms.state.rows[0].description).toBe('New summary');
      } else {
        cms.state.failNextWrite = failure;
        expect(await delivery.publish('1', p, base, 'key-1')).toEqual({
          kind: 'failed',
          code: 'unknown_outcome',
          step: 'write',
        });
        const retry = await delivery.publish('1', p, base, 'key-1');
        expect(retry).toMatchObject({ kind: 'published', adopted: true });
        expect(
          cms.state.requests.filter((r) => r.action === 'update'),
        ).toHaveLength(1);
      }
    }
  });

  test('a new article without a status is created as a draft, not with the target default', async () => {
    const cms = fakeNocoBase([]);
    const { delivery } = await setup(
      cmsTarget(),
      { site: cms.fetcher },
      { secret: 'cms-key' },
    );
    const p = delivery.proposal('1', {
      targetId: 'cms',
      articleId: null,
      base: null,
      baseKey: null,
      draft: draft({ en: { title: 'T', body: 'B' } }, { slug: 'no-status' }),
    });
    expect(p.draft.status).toBe('draft');
    expect(p.changes).toContain('status');
    expect((await delivery.publish('1', p, null, 'k')).kind).toBe('published');
    expect(cms.state.rows[0]).toMatchObject({
      slug: 'no-status',
      status: 'drafted',
    });
  });

  test('new articles: slug conflicts are reported and a retried create never duplicates', async () => {
    const cms = fakeNocoBase([row()]);
    const { delivery } = await setup(
      cmsTarget(),
      { site: cms.fetcher },
      { secret: 'cms-key' },
    );
    const taken = delivery.proposal('1', {
      targetId: 'cms',
      articleId: null,
      base: null,
      baseKey: null,
      draft: draft({ en: { title: 'Other', body: 'Body' } }, { slug: 'hello' }),
    });
    expect(await delivery.publish('1', taken, null, 'k')).toMatchObject({
      kind: 'conflict',
      reason: 'slug_taken',
    });
    expect(() =>
      delivery.proposal('1', {
        targetId: 'cms',
        articleId: null,
        base: null,
        baseKey: null,
        draft: draft({ en: { title: 'No body' } }, { slug: 'x-y' }),
      }),
    ).toThrow();
    const p = delivery.proposal('1', {
      targetId: 'cms',
      articleId: null,
      base: null,
      baseKey: null,
      draft: draft(
        {
          en: { title: 'New post', body: 'Body text here' },
          zh: { title: '新文章' },
        },
        { slug: 'new-post', status: 'draft' },
      ),
    });
    cms.state.failNextWrite = '500-after-save';
    expect((await delivery.publish('1', p, null, 'k')).kind).toBe('failed');
    const retry = await delivery.publish('1', p, null, 'k');
    expect(retry).toMatchObject({ kind: 'published', adopted: true });
    expect(cms.state.rows.filter((r) => r.slug === 'new-post')).toHaveLength(1);
    expect(cms.state.rows.find((r) => r.slug === 'new-post')).toMatchObject({
      status: 'drafted',
      title_cn: '新文章',
      content: 'Body text here',
    });
  });

  test('downstream Git: an edit made only in Git blocks publishing; a pending export does not', async () => {
    const cms = fakeNocoBase([row()]);
    const git = fakeGitHub(
      'org/site',
      {
        'content/articles/hello/index.md': '# Hello\n\nEnglish body',
        'content/articles/hello/index.cn.md': '# 你好\n\n中文正文',
        'content/articles/hello/metadata.json':
          '{"title":"Hello","description":"Old summary"}',
      },
      EXPORTER,
    );
    const target = cmsTarget({
      downstream: {
        repo: 'org/site',
        branch: 'main',
        files: {
          en: 'content/articles/{slug}/index.md',
          zh: 'content/articles/{slug}/index.cn.md',
        },
        metadata: {
          path: 'content/articles/{slug}/metadata.json',
          keys: { en: { title: 'title', description: 'description' } },
        },
        exporter: EXPORTER,
      },
    } as Partial<ArticleTarget>);
    const { delivery, targets } = await setup(
      target,
      { site: cms.fetcher, github: git.fetcher },
      { secret: 'cms-key' },
    );
    const base = await delivery.read('1', 'cms', '7');
    const p = delivery.proposal('1', {
      targetId: 'cms',
      articleId: '7',
      base,
      baseKey: 'k',
      draft: draft({ zh: { body: '新的中文正文' } }),
    });
    // A person changed the English body in the repository (as in PR #185): the export would revert it.
    git.push(
      {
        'content/articles/hello/index.md':
          '# Hello\n\nEnglish body with an internal link',
      },
      { name: 'Person', email: 'person@example.com' },
    );
    const blocked = await delivery.publish('1', p, base, 'k');
    expect(blocked).toMatchObject({
      kind: 'conflict',
      reason: 'downstream',
      divergence: [
        { path: 'content/articles/hello/index.md', field: 'en.body' },
      ],
    });
    expect(cms.state.requests.some((r) => r.action === 'update')).toBe(false);
    // Once the CMS holds the Git version (and the exporter wrote it), publishing proceeds.
    cms.edit(7, { content: '# Hello\n\nEnglish body with an internal link' });
    git.push(
      {
        'content/articles/hello/index.md':
          '# Hello\n\nEnglish body with an internal link',
      },
      EXPORTER,
    );
    const rebased = await delivery.read('1', 'cms', '7');
    // The CMS is ahead of Git for the description, but the exporter wrote that file last: only an export is pending.
    cms.edit(7, { description: 'Edited in CMS' });
    const again = await delivery.publish(
      '1',
      delivery.proposal('1', {
        targetId: 'cms',
        articleId: '7',
        base: rebased,
        baseKey: 'k2',
        draft: draft({ zh: { body: '新的中文正文' } }),
      }),
      rebased,
      'k2',
    );
    expect(again.kind).toBe('published');
    expect(
      await delivery.exported(
        '1',
        'cms',
        { slug: 'hello', locales: { zh: { body: '新的中文正文' } } },
        ['zh.body'],
      ),
    ).toEqual({ done: false });
    git.push(
      { 'content/articles/hello/index.cn.md': '新的中文正文' },
      EXPORTER,
    );
    expect(
      (
        await delivery.exported(
          '1',
          'cms',
          { slug: 'hello', locales: { zh: { body: '新的中文正文' } } },
          ['zh.body'],
        )
      )?.done,
    ).toBe(true);
    expect(
      targets.owned('1', [
        'content/articles/hello/index.md',
        'content/articles/hello/metadata.json',
        'src/pages/index.astro',
      ]),
    ).toEqual([
      'content/articles/hello/index.md',
      'content/articles/hello/metadata.json',
    ]);
  });

  test('editing a target keeps its place; the default target is chosen explicitly and cleared on removal', async () => {
    const cms = fakeNocoBase([row()]);
    const { targets } = await setup(
      cmsTarget(),
      { site: cms.fetcher },
      { secret: 'cms-key' },
    );
    const ids = () => targets.list('1').targets.map((t) => t.id);
    await targets.save('1', {
      revision: 1,
      target: cmsTarget({
        id: 'second',
        name: 'Second',
      } as Partial<ArticleTarget>),
      secret: 'cms-key',
    });
    await targets.save('1', {
      revision: 2,
      target: cmsTarget({
        id: 'third',
        name: 'Third',
      } as Partial<ArticleTarget>),
      secret: 'cms-key',
    });
    // Without a choice the first target is the default.
    expect(targets.list('1')).toMatchObject({ defaultTargetId: 'cms' });
    await targets.save('1', {
      revision: 3,
      target: cmsTarget({ name: 'Renamed' }),
    });
    expect(ids()).toEqual(['cms', 'second', 'third']);
    expect(targets.list('1').defaultTargetId).toBe('cms');
    await targets.setDefault('1', { revision: 4, id: 'third' });
    expect(targets.list('1')).toMatchObject({
      revision: 5,
      defaultTargetId: 'third',
    });
    await expect(
      targets.setDefault('1', { revision: 5, id: 'missing' }),
    ).rejects.toThrow('articles.targetMissing');
    await expect(
      targets.setDefault('1', { revision: 4, id: 'second' }),
    ).rejects.toThrow('articles.stale');
    // Removing another target keeps the choice; removing the default falls back to the first.
    await targets.remove('1', { revision: 5, id: 'second' });
    expect(targets.list('1').defaultTargetId).toBe('third');
    await targets.remove('1', { revision: 6, id: 'third' });
    expect(targets.list('1')).toMatchObject({ defaultTargetId: 'cms' });
  });

  test('credentials stay on the server and cannot be redirected to a new endpoint', async () => {
    const cms = fakeNocoBase([row()]);
    const { targets } = await setup(
      cmsTarget(),
      { site: cms.fetcher },
      { secret: 'cms-key' },
    );
    expect(JSON.stringify(targets.list('1'))).not.toContain('cms-key');
    await expect(
      targets.save('1', {
        revision: 1,
        target: cmsTarget({
          baseUrl: 'https://evil.example.com',
        } as Partial<ArticleTarget>),
      }),
    ).rejects.toThrow('articles.secretForNewEndpoint');
    await targets.save('1', {
      revision: 1,
      target: cmsTarget({ name: 'Renamed' }),
    });
    expect(targets.list('1')).toMatchObject({
      revision: 2,
      targets: [{ name: 'Renamed', hasSecret: true }],
    });
    await expect(
      targets.save('1', { revision: 1, target: cmsTarget() }),
    ).rejects.toThrow('articles.stale');
    expect(await targets.test('1', 'cms')).toMatchObject({
      ok: true,
      sample: { id: '7' },
    });
  });
});

describe('article API target', () => {
  const api = (): ArticleTarget =>
    ({
      ...ARTICLE_TARGET_PRESETS.http,
      id: 'api',
      name: 'API',
      baseUrl: 'https://site.example.com/api',
      locales: ['en'],
    }) as ArticleTarget;
  test('updates are conditional on the version and carry an idempotency key', async () => {
    const server = fakeArticleApi();
    server.state.articles.push({
      id: 'a1',
      slug: 'hello',
      status: 'published',
      version: 'v0',
      locales: { en: { title: 'Hello', description: '', body: 'Body' } },
    });
    const { delivery } = await setup(
      api(),
      { site: server.fetcher },
      { secret: 'api-key' },
    );
    const base = await delivery.read('1', 'api', 'a1');
    const p = delivery.proposal('1', {
      targetId: 'api',
      articleId: 'a1',
      base,
      baseKey: 'k',
      draft: draft({ en: { body: 'New body' } }),
    });
    expect(await delivery.publish('1', p, base, 'key-1')).toMatchObject({
      kind: 'published',
    });
    const patch = server.state.requests.find((r) => r.method === 'PATCH')!;
    expect(patch).toMatchObject({
      key: 'key-1',
      body: { baseVersion: 'v0', locales: { en: { body: 'New body' } } },
    });
    // Someone writes between our read and our write: the server refuses the stale version.
    const p2 = delivery.proposal('1', {
      targetId: 'api',
      articleId: 'a1',
      base: await delivery.read('1', 'api', 'a1'),
      baseKey: 'k',
      draft: draft({ en: { title: 'Title by AI' } }),
    });
    const original = server.fetcher;
    const racing = async (url: string, init: RequestInit) => {
      if (init.method === 'PATCH') {
        const a = server.state.articles[0];
        a.locales.en.title = 'Title by editor';
        a.version = 'v-editor';
      }
      return original(url, init);
    };
    const { delivery: d2 } = await setup(
      api(),
      { site: racing },
      { secret: 'api-key' },
    );
    expect(
      await d2.publish('1', p2, await delivery.read('1', 'api', 'a1'), 'key-2'),
    ).toMatchObject({ kind: 'conflict', reason: 'changed' });
    expect(server.state.articles[0].locales.en.title).toBe('Title by editor');
  });
  test('a retried create with the same key returns the same article', async () => {
    const server = fakeArticleApi();
    const { delivery } = await setup(
      api(),
      { site: server.fetcher },
      { secret: 'api-key' },
    );
    const p = delivery.proposal('1', {
      targetId: 'api',
      articleId: null,
      base: null,
      baseKey: null,
      draft: draft({ en: { title: 'T', body: 'B' } }, { slug: 'fresh' }),
    });
    const a = await delivery.publish('1', p, null, 'create-1');
    const b = await delivery.publish('1', p, null, 'create-1');
    expect(a).toMatchObject({ kind: 'published' });
    expect(b).toMatchObject({ kind: 'published', adopted: true });
    expect(server.state.articles).toHaveLength(1);
  });
});

describe('Git files target', () => {
  const gitTarget = (): ArticleTarget =>
    ({
      ...ARTICLE_TARGET_PRESETS['git-files'],
      id: 'git',
      name: 'Repo',
      repo: 'org/blog',
      locales: ['en'],
    }) as ArticleTarget;
  const file =
    '---\ntitle: "Hello"\ndescription: "Old"\nlayout: post\n---\n\nBody';
  test('front matter keeps other keys and the body', () => {
    expect(readFrontmatter(file)).toEqual({
      keys: { title: 'Hello', description: 'Old', layout: 'post' },
      body: 'Body',
    });
    expect(
      writeFrontmatter(
        file,
        { title: 'New "quoted"', description: undefined },
        undefined,
      ),
    ).toBe(
      '---\ntitle: "New \\"quoted\\""\ndescription: "Old"\nlayout: post\n---\n\nBody',
    );
  });
  test('commits only on the head it checked; a racing change to the article is a conflict, an unrelated one is not', async () => {
    const git = fakeGitHub('org/blog', {
      'content/blog/hello/index.md': file,
      'README.md': 'readme',
    });
    const { delivery } = await setup(
      gitTarget(),
      { github: git.fetcher },
      { secret: 'gh-token' },
    );
    expect(await delivery.provider('1', 'git').search('hel', 5)).toEqual([
      { id: 'hello', slug: 'hello', title: 'hello' },
    ]);
    const base = await delivery.read('1', 'git', 'hello');
    const p = delivery.proposal('1', {
      targetId: 'git',
      articleId: 'hello',
      base,
      baseKey: 'k',
      draft: draft({ en: { description: 'New summary' } }),
    });
    // An unrelated commit lands between our check and our ref update: we retry on the new head and keep it.
    git.state.beforeRef = () => git.push({ 'README.md': 'changed readme' });
    expect(await delivery.publish('1', p, base, 'k')).toMatchObject({
      kind: 'published',
    });
    expect(git.read('README.md')).toBe('changed readme');
    expect(
      readFrontmatter(git.read('content/blog/hello/index.md')!).keys,
    ).toMatchObject({ description: 'New summary', layout: 'post' });
    // A commit to the article itself lands in the same window: nothing of ours is written.
    const base2 = await delivery.read('1', 'git', 'hello');
    const p2 = delivery.proposal('1', {
      targetId: 'git',
      articleId: 'hello',
      base: base2,
      baseKey: 'k',
      draft: draft({ en: { title: 'AI title' } }),
    });
    git.state.beforeRef = () =>
      git.push({
        'content/blog/hello/index.md': file.replace(
          'Body',
          'Body edited by a person',
        ),
      });
    expect(await delivery.publish('1', p2, base2, 'k2')).toMatchObject({
      kind: 'conflict',
      reason: 'changed',
    });
    expect(git.read('content/blog/hello/index.md')).toContain(
      'Body edited by a person',
    );
    expect(
      readFrontmatter(git.read('content/blog/hello/index.md')!).keys.title,
    ).toBe('Hello');
  });
});

// T-34 on Studio (2026-10-22) failed with only `unavailable` recorded: a failure now says where it stopped and why.
describe('a failed publish keeps its step and detail', () => {
  async function ready(fetchers: { site?: Fetch; github?: Fetch }) {
    const cms = fakeNocoBase([row()]);
    const target = cmsTarget({
      downstream: {
        repo: 'org/site',
        branch: 'main',
        files: { en: 'content/articles/{slug}/index.md' },
        exporter: EXPORTER,
      },
    } as Partial<ArticleTarget>);
    const { delivery } = await setup(
      target,
      { site: fetchers.site || cms.fetcher, github: fetchers.github },
      { secret: 'cms-key' },
    );
    const read = await setup(
      cmsTarget(),
      { site: cms.fetcher },
      {
        secret: 'cms-key',
      },
    );
    const base = await read.delivery.read('1', 'cms', '7');
    const p = delivery.proposal('1', {
      targetId: 'cms',
      articleId: '7',
      base,
      baseKey: 'k',
      draft: draft({ en: { body: '# Hello\n\nNew English body' } }),
    });
    return { cms, delivery, base, p };
  }

  test('a GitHub rate limit in the downstream check', async () => {
    const git = fakeGitHub(
      'org/site',
      { 'content/articles/hello/index.md': '# Hello\n\nEnglish body' },
      EXPORTER,
    );
    let limited = true;
    const { cms, delivery, base, p } = await ready({
      github: (url, init) =>
        limited
          ? Promise.resolve(
              new Response('{"message":"API rate limit exceeded"}', {
                status: 429,
              }),
            )
          : git.fetcher(url, init),
    });
    expect(await delivery.publish('1', p, base, 'k')).toEqual({
      kind: 'failed',
      code: 'unavailable',
      step: 'downstream',
      detail: 'github:429',
    });
    expect(cms.state.requests.some((r) => r.action === 'update')).toBe(false);
    limited = false;
    expect((await delivery.publish('1', p, base, 'k')).kind).toBe('published');
  });

  test('an unexpected error keeps its name and message', async () => {
    const git = fakeGitHub(
      'org/site',
      { 'content/articles/hello/index.md': '# Hello\n\nEnglish body' },
      EXPORTER,
    );
    const { delivery, base, p } = await ready({ github: git.fetcher });
    const update = vi
      .spyOn(NocoBaseArticles.prototype, 'update')
      .mockRejectedValueOnce(
        new TypeError("Cannot read properties of undefined (reading 'id')"),
      );
    try {
      expect(await delivery.publish('1', p, base, 'k')).toEqual({
        kind: 'failed',
        code: 'unavailable',
        step: 'write',
        detail: "TypeError: Cannot read properties of undefined (reading 'id')",
      });
    } finally {
      update.mockRestore();
    }
  });

  test('a request that got no answer names the network code, reason and host', async () => {
    const { delivery, base, p } = await ready({
      site: () =>
        Promise.reject(
          networkFailure('ETIMEDOUT', 'TimeoutError', 'cms.example.com', true),
        ),
    });
    expect(await delivery.publish('1', p, base, 'k')).toEqual({
      kind: 'failed',
      code: 'unavailable',
      step: 'read',
      detail: 'ETIMEDOUT (timeout) cms.example.com via proxy',
    });
  });

  test('a missing key is a target failure with its reason', async () => {
    const { delivery, targets } = await setup(
      cmsTarget(),
      {},
      { secret: 'cms-key' },
    );
    vi.spyOn(targets, 'provider').mockImplementationOnce(() => {
      throw Object.assign(new Error('articles.secretRequired'), {
        status: 409,
      });
    });
    expect(
      await delivery.publish(
        '1',
        {
          targetId: 'cms',
          articleId: '7',
          baseKey: null,
          baseVersion: null,
          draft: { locales: {} },
          changes: [],
        },
        null,
        'k',
      ),
    ).toEqual({
      kind: 'failed',
      code: 'target_missing',
      step: 'read',
      detail: 'Error: articles.secretRequired',
    });
  });

  test('details are one line, clipped, and never carry credentials', () => {
    const token = `ghp_${'a'.repeat(36)}`;
    const detail = errorDetail(
      new Error(
        `request to https://user:pa55word@proxy.example.com failed\nAuthorization: Bearer abcdefghijklmnop ${token} ?access_token=s3cr3t&page=2 ${'x'.repeat(800)}`,
      ),
    )!;
    expect(detail).toContain('https://***@proxy.example.com failed');
    expect(detail).not.toMatch(/pa55word|abcdefghijklmnop|ghp_a|s3cr3t/);
    expect(detail).not.toContain('\n');
    expect(detail.length).toBeLessThanOrEqual(500);
    // A code with nothing more to say adds nothing; a cause is followed.
    expect(errorDetail(new ArticleError('unavailable'))).toBeUndefined();
    expect(
      errorDetail(
        Object.assign(new ArticleError('unavailable', 'github'), {
          cause: new TypeError('fetch failed'),
        }),
      ),
    ).toBe('github ← TypeError: fetch failed');
  });
});

test('rejects an eleventh target before writing and permits editing or removing at the limit', async () => {
  const { targets, vars } = await setup(cmsTarget(), {}, { secret: 'cms-key' });
  for (let i = 1; i < 10; i++) {
    await targets.save('1', {
      revision: i,
      target: cmsTarget({ id: `cms-${i}` }),
      secret: 'cms-key',
    });
  }
  const before = [...vars.values.entries()];
  await expect(
    targets.save('1', {
      revision: 10,
      target: cmsTarget({ id: 'cms-10' }),
      secret: 'cms-key',
    }),
  ).rejects.toMatchObject({ message: 'articles.invalidTarget', status: 400 });
  expect([...vars.values.entries()]).toEqual(before);
  expect(targets.list('1')).toMatchObject({ revision: 10 });
  expect(targets.list('1').targets).toHaveLength(10);
  const edited = await targets.save('1', {
    revision: 10,
    target: cmsTarget({ name: 'Updated CMS' }),
  });
  expect(edited.targets).toHaveLength(10);
  expect(edited.targets.find((t) => t.id === 'cms')?.name).toBe('Updated CMS');
  await targets.remove('1', { revision: 11, id: 'cms-9' });
  const added = await targets.save('1', {
    revision: 12,
    target: cmsTarget({ id: 'cms-10' }),
    secret: 'cms-key',
  });
  expect(added.targets).toHaveLength(10);
  expect(added.revision).toBe(13);
});

test('reads a page address back to the slug it is published under', () => {
  const pages = {
    en: 'https://www.example.com/en/blog/{slug}',
    zh: 'https://www.example.com/cn/blog/{slug}/',
  };
  expect(
    slugFromPage(pages, 'https://www.example.com/en/blog/workflow-tools'),
  ).toEqual({ locale: 'en', slug: 'workflow-tools' });
  // No www, a trailing slash, a query and a fragment change nothing; existing slugs may hold dots.
  expect(
    slugFromPage(pages, 'https://example.com/cn/blog/v2.2.29/?utm=x#top'),
  ).toEqual({ locale: 'zh', slug: 'v2.2.29' });
  for (const other of [
    'https://www.example.com/en/blog/',
    'https://www.example.com/en/blog/a/b',
    'https://www.example.com/en/docs/workflow-tools',
    'https://other.example/en/blog/workflow-tools',
    'not a url',
    'ftp://www.example.com/en/blog/x',
  ])
    expect(slugFromPage(pages, other)).toBeNull();
  expect(
    slugFromPage(undefined, 'https://www.example.com/en/blog/x'),
  ).toBeNull();
});

test("finds the article each of a task's pages belongs to, and says when a target could not be asked", async () => {
  const cms = fakeNocoBase([row()]);
  const { targets } = await setup(
    cmsTarget(),
    { site: cms.fetcher },
    { secret: 'cms-key' },
  );
  const hello = {
    targetId: 'cms',
    articleId: '7',
    slug: 'hello',
    title: '你好',
    url: 'https://example.com/cn/blog/hello/',
    // The languages it has text in (Japanese is empty), for a translation's choice.
    locales: ['en', 'zh'],
  };
  expect(
    await targets.match('1', [
      'https://www.example.com/en/docs/hello',
      'https://example.com/cn/blog/hello/',
    ]),
  ).toEqual({
    article: hello,
    unchecked: false,
    // Every page in its order (2026-10-29): a page no target publishes is a page of the site itself.
    pages: [
      { url: 'https://www.example.com/en/docs/hello' },
      { url: 'https://example.com/cn/blog/hello/', article: hello },
    ],
  });
  // The same languages read for an article picked by hand.
  expect(await targets.languages('1', 'cms', '7')).toEqual({
    locales: ['en', 'zh'],
  });
  // A page of the site that no target publishes, or a slug no article has: not found, and known to be so.
  expect(
    await targets.match('1', [
      'https://www.example.com/pricing',
      'https://www.example.com/en/blog/missing',
    ]),
  ).toEqual({
    article: null,
    unchecked: false,
    pages: [
      { url: 'https://www.example.com/pricing' },
      { url: 'https://www.example.com/en/blog/missing' },
    ],
  });
  expect(
    await targets.match('1', 'https://www.example.com/en/blog/hello'),
  ).toEqual({ article: null, unchecked: false, pages: [] });
  // A target that cannot be reached: not found is not known for sure, for that page only.
  const offline = await setup(
    cmsTarget(),
    {
      site: async () => {
        throw new Error('offline');
      },
    },
    { secret: 'cms-key' },
  );
  expect(
    await offline.targets.match('1', [
      'https://www.example.com/en/blog/hello',
      'https://www.example.com/pricing',
    ]),
  ).toEqual({
    article: null,
    unchecked: true,
    pages: [
      { url: 'https://www.example.com/en/blog/hello', unchecked: true },
      { url: 'https://www.example.com/pricing' },
    ],
  });
});

// 2026-10-27 (T-47): the Agent got `locale:en` back for a Chinese-only new article and took it for a setting to fix.
describe('a draft the target cannot take is explained in words', () => {
  const cms = {
    ...ARTICLE_TARGET_PRESETS['nocobase-api'],
    id: 'cms',
    name: 'NocoBase CMS',
  } as ArticleTarget;
  const news = {
    ...cms,
    id: 'news',
    name: 'News',
    locales: ['en', 'zh'],
    fields: {
      ...ARTICLE_TARGET_PRESETS['nocobase-api'].fields,
      locales: {
        en: { title: 'title', description: 'description', body: 'content' },
        zh: { body: 'content_cn' },
      },
    },
  } as ArticleTarget;
  const problem = (
    target: ArticleTarget,
    draft: unknown,
    primary?: string | null,
  ) => {
    try {
      cleanDraft(target, draft, true, primary);
    } catch (error) {
      expect(error).toBeInstanceOf(DraftRejected);
      return {
        code: (error as DraftRejected).message,
        text: draftRejection(error as DraftRejected),
      };
    }
    return null;
  };
  const post = (locales: unknown, more = {}) => ({
    slug: 'agent-governance',
    locales,
    ...more,
  });

  test('a new article needs a title and body in its primary language, the first of the target unless the task chose another', () => {
    expect(problem(cms, post({ zh: { title: '标题', body: '正文' } }))).toEqual(
      {
        code: 'missing:en',
        text: '新文章必须有英语（en）的标题和正文，这次只写了：中文（zh）。',
      },
    );
    expect(problem(cms, post({}))).toMatchObject({
      text: '新文章必须有英语（en）的标题和正文，这次没有写任何语言。',
    });
    expect(problem(cms, post({ en: { body: 'Body' } }))).toMatchObject({
      text: '新文章的英语（en）要同时有标题和正文，这次缺少 title。',
    });
    expect(
      problem(cms, post({ zh: { title: '标题', body: '正文' } }), 'zh'),
    ).toBeNull();
    // Another target while the task's other languages are still to be translated.
    expect(problem(news, post({ zh: { body: '正文' } }), null)).toBeNull();
  });

  test('languages, fields, the address and lengths the target cannot take', () => {
    expect(
      problem(cms, post({ fr: { title: 'Titre', body: 'Texte' } })),
    ).toEqual({
      code: 'locale:fr',
      text: '发布目标“NocoBase CMS”没有法语（fr），只能写：英语（en）、中文（zh）、日语（ja）。',
    });
    expect(problem(cms, post({ English: { title: 'T', body: 'B' } }))).toEqual({
      code: 'draft:locales.English',
      text: '发布目标“NocoBase CMS”没有English，只能写：英语（en）、中文（zh）、日语（ja）。',
    });
    expect(
      problem(
        news,
        post({ en: { title: 'T', body: 'B' }, zh: { title: '标题' } }),
      ),
    ).toEqual({
      code: 'field:zh.title',
      text: '发布目标“News”不保存中文（zh）的 title，请去掉这一项。',
    });
    expect(
      problem(
        cms,
        post({ en: { title: 'T', body: 'B' } }, { slug: 'Agent Governance' }),
      ),
    ).toMatchObject({
      code: 'draft:slug',
      text: expect.stringMatching(/^新文章需要地址（slug）/),
    });
    expect(
      problem(cms, post({ en: { title: 'T'.repeat(301), body: 'B' } })),
    ).toEqual({
      code: 'draft:locales.en.title',
      text: '英语（en）的 title 太长，最多 300 个字符。',
    });
    expect(
      problem(cms, { ...post({ en: { title: 'T', body: 'B' } }), tags: [] }),
    ).toMatchObject({
      code: 'draft:article',
      text: expect.stringMatching(/^文章的 article 格式不对。/),
    });
  });

  test('another target is named in front of its problem', () => {
    const delivery = new ArticleDelivery({
      target: (_project: string, id: string) => (id === 'news' ? news : cms),
    } as unknown as ArticleTargets);
    let error: unknown;
    try {
      delivery.alsoProposal('1', {
        targetId: 'news',
        articleId: null,
        base: null,
        baseKey: null,
        source: null,
        draft: post({ zh: { title: '标题', body: '正文' } }) as never,
      });
    } catch (e) {
      error = e;
    }
    expect(draftRejection(error as DraftRejected)).toBe(
      '发布到“News”时：新文章必须有英语（en）的标题和正文，这次只写了：中文（zh）。',
    );
  });

  test('a person reading another language gets the message and the language names in it', () => {
    const text = draftRejection(
      new DraftRejected('missing:en', {
        key: 'articles.draft.forTarget',
        params: {
          0: 'News',
          1: {
            key: 'articles.draft.needsPrimary',
            params: { 0: '英语（en）', 1: '中文（zh）、日语（ja）' },
          },
        },
      }),
    );
    try {
      setDictionary(english, 'en-US');
      expect($legacyText(text)).toBe(
        'Publishing to “News”: A new article needs a title and body in English (en); this draft only has: Chinese (zh), Japanese (ja).',
      );
      setDictionary(traditional, 'zh-TW');
      expect($legacyText(text)).toBe(
        '發布到「News」時：新文章必須有英文（en）的標題和內文，這次只寫了：中文（zh）、日文（ja）。',
      );
    } finally {
      setDictionary(null);
    }
  });
});

// T-55 (2026-10-29): the NocoBase CMS maps English posts to /en/blog/{slug}, while the site also serves them, and Search
// Console reports them, at /blog/{slug}/. The page was taken for a page of the site and its change for a pull request,
// although the repository's copy is exported by the CMS.
const t55 = 'https://www.example.com/blog/hello/';

test('a language can have several page addresses; the first is the one links use', () => {
  const pages = {
    en: [
      'https://www.example.com/blog/{slug}/',
      'https://www.example.com/en/blog/{slug}',
    ],
    zh: 'https://www.example.com/cn/blog/{slug}',
  };
  expect(articleTargetSchema.safeParse(cmsTarget({ pages })).success).toBe(
    true,
  );
  expect(
    articleTargetSchema.safeParse(
      cmsTarget({ pages: { en: ['http://www.example.com/blog/{slug}'] } }),
    ).success,
  ).toBe(false);
  for (const url of [
    t55,
    'http://example.com/en/blog/hello?ref=x#top',
    'https://www.example.com/en/blog/hello/',
  ])
    expect(slugFromPage(pages, url)).toEqual({ locale: 'en', slug: 'hello' });
  expect(slugFromPage(pages, 'https://www.example.com/cn/blog/hello')).toEqual({
    locale: 'zh',
    slug: 'hello',
  });
});

test("a page no pattern reads is guessed to be an article only on the target's host, under the pattern's own path", () => {
  const pages = {
    en: 'https://www.example.com/en/blog/{slug}',
    zh: 'https://www.example.com/cn/blog/{slug}',
  };
  expect(looseSlugFromPage(pages, t55, ['en', 'zh'])).toEqual({
    locale: 'en',
    slug: 'hello',
  });
  // The first language of the target whose pattern fits.
  expect(looseSlugFromPage(pages, t55, ['zh', 'en'])?.locale).toBe('zh');
  for (const url of [
    'https://www.example.com/cn/pricing',
    'https://www.example.com/solutions/crm',
    'https://www.example.com/pricing',
    'https://www.example.com/blog/category/news',
    'https://other.example/blog/hello',
  ])
    expect(looseSlugFromPage(pages, url, ['en', 'zh'])).toBeNull();
});

test('T-55: the article of a page in another form is found by its last path part; one exported by the CMS is never a page of the site', async () => {
  const cms = fakeNocoBase([row()]);
  const { targets } = await setup(
    cmsTarget(),
    { site: cms.fetcher },
    { secret: 'cms-key' },
  );
  expect((await targets.match('1', [t55])).pages).toEqual([
    {
      url: t55,
      article: expect.objectContaining({
        targetId: 'cms',
        articleId: '7',
        slug: 'hello',
        title: 'Hello',
        url: t55,
      }),
    },
  ]);
  // Exported to the website repository: a post not found is a guess to ask about, not a page to change by PR.
  const exported = await setup(
    cmsTarget({
      downstream: {
        repo: 'org/site',
        branch: 'main',
        files: { en: 'content/articles/{slug}/index.md' },
      },
    } as Partial<ArticleTarget>),
    { site: fakeNocoBase([row()]).fetcher },
    { secret: 'cms-key' },
  );
  expect(
    (
      await exported.targets.match('1', [
        'https://www.example.com/blog/missing/',
        'https://www.example.com/en/blog/gone',
        'https://www.example.com/pricing',
      ])
    ).pages,
  ).toEqual([
    {
      url: 'https://www.example.com/blog/missing/',
      guess: { targetId: 'cms', slug: 'missing' },
    },
    {
      url: 'https://www.example.com/en/blog/gone',
      guess: { targetId: 'cms', slug: 'gone' },
    },
    { url: 'https://www.example.com/pricing' },
  ]);
});
