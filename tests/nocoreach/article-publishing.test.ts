import { describe, expect, test } from 'vitest';
import {
  ARTICLE_TARGET_PRESETS,
  type ArticleTarget,
} from '../../shared/article-publishing.js';
import { ArticleDelivery } from '../../server/nocoreach/articles/delivery.js';
import {
  readFrontmatter,
  writeFrontmatter,
} from '../../server/nocoreach/articles/git-files.js';
import { ArticleTargets } from '../../server/nocoreach/articles/targets.js';
import type { LegacyVariables } from '../../server/nocoreach/legacy/variables.js';
import { fakeArticleApi, fakeGitHub, fakeNocoBase } from './article-fakes.js';

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
      id: 'repo',
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
    expect(await delivery.provider('1', 'repo').search('hel', 5)).toEqual([
      { id: 'hello', slug: 'hello', title: 'hello' },
    ]);
    const base = await delivery.read('1', 'repo', 'hello');
    const p = delivery.proposal('1', {
      targetId: 'repo',
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
    const base2 = await delivery.read('1', 'repo', 'hello');
    const p2 = delivery.proposal('1', {
      targetId: 'repo',
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
