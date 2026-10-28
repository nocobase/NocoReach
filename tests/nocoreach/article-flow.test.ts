import { fakeAgents, selectAgent, claim, finish } from './agents-fixture';
import { test, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import { ArticleTargets } from '../../server/nocoreach/articles/targets.js';
import { ArticleDelivery } from '../../server/nocoreach/articles/delivery.js';
import { NocoBaseArticles } from '../../server/nocoreach/articles/nocobase-api.js';
import { ARTICLE_TARGET_PRESETS } from '../../shared/article-publishing.js';
import { boardState } from '../../server/nocoreach/execution/model.js';
import { fakeGitHub, fakeNocoBase } from './article-fakes.js';
vi.setConfig({ testTimeout: 60000 });

const EXPORTER = { name: 'NocoBase-CMS', email: 'cms@example.com' };
const article = () => ({
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

// The task-flow.test.ts fixture, with a CMS publishing target (and optionally its Git export) attached.
async function fixture({ downstream = false, news = null } = {}) {
  const state = {
    nrTasks: [
      {
        id: 1,
        projectId: '1',
        title: 'Improve the hello post',
        brief: 'Supplied evidence only',
        status: '待处理',
        evidence: {},
      },
    ],
    nrSnapshots: [],
    users: [{ id: 1, username: 'tester', roles: [{ name: 'admin' }] }],
  };
  let sequence = 100;
  const match = (r, filter = {}) =>
    Object.entries(filter).every(([k, v]) =>
      v && typeof v === 'object'
        ? v.$startsWith !== undefined && String(r[k]).startsWith(v.$startsWith)
        : String(r[k]) === String(v),
    );
  const row = (r) =>
    r
      ? {
          ...r,
          get: (k) => structuredClone(r[k]),
          toJSON: () => structuredClone(r),
        }
      : null;
  const repo = (name) => ({
    findOne: async ({ filter, filterByTk }) =>
      row(
        state[name].find((r) =>
          filterByTk !== undefined
            ? String(r.id) === String(filterByTk)
            : match(r, filter),
        ),
      ),
    find: async ({ filter, offset = 0, limit = 100 }) =>
      state[name]
        .filter((r) => match(r, filter))
        .slice(offset, offset + limit)
        .map(row),
    create: async ({ values }) => {
      const r = { id: sequence++, ...structuredClone(values) };
      state[name].push(r);
      return row(r);
    },
    update: async ({ filterByTk, values }) => {
      Object.assign(
        state[name].find((r) => String(r.id) === String(filterByTk)),
        structuredClone(values),
      );
    },
  });
  let tail = Promise.resolve();
  const values = new Map();
  const variables = {
    get: (k) => values.get(k),
    set: async (k, v) => values.set(k, v),
    cannotRead: () => false,
  };
  const cms = fakeNocoBase([article()]);
  const git = fakeGitHub(
    'org/site',
    {
      'content/articles/hello/index.md': '# Hello\n\nEnglish body',
      'content/articles/hello/index.cn.md': '# 你好\n\n中文正文',
    },
    EXPORTER,
  );
  // A second CMS (`news`): English and the Chinese body only, so other Chinese fields are left out there.
  const other = fakeNocoBase(news || []);
  const articleTargets = new ArticleTargets(variables, (_id, connection) =>
    connection === 'github'
      ? git.fetcher
      : (url, init) =>
          new URL(url).host === 'news.example.com'
            ? other.fetcher(url, init)
            : cms.fetcher(url, init),
  );
  await articleTargets.save('1', {
    revision: 0,
    secret: 'cms-key',
    target: {
      ...ARTICLE_TARGET_PRESETS['nocobase-api'],
      id: 'cms',
      name: 'NocoBase CMS',
      baseUrl: 'https://cms.example.com',
      pages: {
        en: 'https://www.example.com/en/blog/{slug}',
        zh: 'https://www.example.com/cn/blog/{slug}',
      },
      ...(downstream
        ? {
            downstream: {
              repo: 'org/site',
              branch: 'main',
              files: {
                en: 'content/articles/{slug}/index.md',
                zh: 'content/articles/{slug}/index.cn.md',
              },
              exporter: EXPORTER,
            },
          }
        : {}),
    },
  });
  if (news)
    await articleTargets.save('1', {
      revision: 1,
      secret: 'cms-key',
      target: {
        ...ARTICLE_TARGET_PRESETS['nocobase-api'],
        id: 'news',
        name: 'News',
        baseUrl: 'https://news.example.com',
        locales: ['en', 'zh'],
        fields: {
          ...ARTICLE_TARGET_PRESETS['nocobase-api'].fields,
          locales: {
            en: { title: 'title', description: 'description', body: 'content' },
            zh: { body: 'content_cn' },
          },
        },
        pages: { en: 'https://news.example.com/{slug}' },
      },
    });
  const p = {
    agents: fakeAgents(),
    articleTargets,
    articles: new ArticleDelivery(articleTargets),
    project: async (id) => {
      if (id !== '1') throw Object.assign(Error('project'), { status: 404 });
      return { name: 'Synthetic', writingStyle: 'Plain' };
    },
    db: {
      getRepository: repo,
      sequelize: {
        query: async () => {},
        transaction: (fn) => {
          const result = tail.then(async () => {
            const old = structuredClone(state);
            try {
              const after = [];
              const value = await fn({
                connection: {},
                afterCommit: (cb) => after.push(cb),
              });
              for (const cb of after) await cb();
              return value;
            } catch (e) {
              Object.assign(state, old);
              throw e;
            }
          });
          tail = result.catch(() => {});
          return result;
        },
      },
    },
    app: { resourceManager: { define: () => {} }, acl: { allow: () => {} } },
  };
  const s = new TaskService(p, {
    prepare: async () => ({}),
    invoke: async () => ({ content: '' }),
  });
  const command = async (command, body = {}) =>
    s.update(
      '1',
      {
        taskId: '1',
        revision: (await s.get('1', '1')).work.revision,
        requestId: randomUUID(),
        command,
        ...body,
      },
      '1',
      'Tester',
    );
  const view = () => s.get('1', '1');
  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
  };
  await selectAgent({ s });
  return {
    s,
    state,
    cms,
    git,
    news: other,
    articleTargets,
    command,
    view,
    settle,
  };
}
const review = (d) => d.work.results[d.work.stageIndex - 1];

async function draftAndApprove(
  f,
  draft = {
    locales: { zh: { body: '# 你好\n\n改写后的中文正文，包含新的内链。' } },
    verifyText: '改写后的中文正文',
    summary: 'Rewrote the Chinese body',
  },
) {
  const { run } = await claim(f);
  expect(run.mode).toBe('article');
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: '改了中文正文。',
    article: draft,
  });
  let d = await f.view();
  expect(d.work.flow.stages[d.work.stageIndex].kind).toBe('review');
  d = await f.command('approveStage', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: review(d).id,
    checked: [],
  });
  await f.settle();
  return { run, d };
}

test('an article task reads the CMS source, drafts without a repository and publishes only the approved fields', async () => {
  const f = await fixture();
  let d = await f.view();
  expect(d.articleTargets).toEqual([
    expect.objectContaining({
      id: 'cms',
      name: 'NocoBase CMS',
      kind: 'nocobase-api',
      // The public page patterns, so the task page can link the article; never the key or the API address.
      pages: {
        en: 'https://www.example.com/en/blog/{slug}',
        zh: 'https://www.example.com/cn/blog/{slug}',
      },
    }),
  ]);
  expect(JSON.stringify(d.articleTargets)).not.toMatch(
    /cms-key|cms\.example\.com/,
  );
  d = await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  expect(d.work.article).toMatchObject({
    targetId: 'cms',
    articleId: '7',
    slug: 'hello',
    title: 'Hello',
  });
  d = await f.command('startTask', { playbookId: 'optimize-page' });
  expect(d.work.delivery).toMatchObject({
    kind: 'article',
    targetId: 'cms',
    articleId: '7',
  });
  const { run } = await claim(f);
  expect(run.mode).toBe('article');
  expect(run.input.repo).toBeNull();
  expect(run.input.article).toMatchObject({
    action: 'update',
    target: { locales: ['en', 'zh', 'ja'] },
    source: { slug: 'hello', locales: { zh: { body: '# 你好\n\n中文正文' } } },
  });
  expect(run.capabilitySnapshot).toEqual(['article.draft']);
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: '改了中文正文。',
    article: { locales: { zh: { body: '# 你好\n\n第一版' } } },
  });
  d = await f.view();
  const stage = d.work.flow.stages[d.work.stageIndex];
  expect(review(d).article).toMatchObject({
    targetId: 'cms',
    articleId: '7',
    baseVersion: '2026-10-17T00:00:00.000Z',
    changes: ['zh.body'],
  });
  // The owner edits the draft in NocoReach: a new immutable version, reviewed and approved as such.
  d = await f.command('editArticleDraft', {
    stageKey: stage.key,
    artifactId: review(d).id,
    article: {
      locales: {
        zh: { body: '# 你好\n\n人工修改后的中文正文。' },
        en: { description: 'A new summary' },
      },
      verifyText: '人工修改后的中文正文',
    },
  });
  const edited = review(d);
  expect(edited.version).toBe(2);
  expect(edited.article.changes).toEqual(['en.description', 'zh.body']);
  d = await f.command('approveStage', {
    stageKey: stage.key,
    artifactId: edited.id,
    checked: [],
  });
  expect(d.work.release).toMatchObject({
    state: 'publishing',
    article: { artifactId: edited.id },
  });
  await f.settle();
  d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'verifying',
    verifyText: '人工修改后的中文正文',
    pages: [
      'https://www.example.com/en/blog/hello',
      'https://www.example.com/cn/blog/hello',
    ],
    article: {
      published: { articleId: '7', written: ['en.description', 'zh.body'] },
    },
  });
  const write = f.cms.state.requests.filter((r) => r.action === 'update');
  expect(write).toHaveLength(1);
  expect(write[0].body).toEqual({
    description: 'A new summary',
    content_cn: '# 你好\n\n人工修改后的中文正文。',
  });
  expect(d.work.history.map((e) => e.action)).toContain('articlePublished');
});

test('a CMS edit to the same field during review blocks publishing; rebasing keeps both versions for a new review', async () => {
  const f = await fixture();
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  await f.command('startTask', { playbookId: 'optimize-page' });
  f.cms.edit(7, { content_cn: '编辑在 CMS 里同时修改了中文正文' });
  await draftAndApprove(f);
  let d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'publish_conflict',
    article: {
      conflict: {
        reason: 'changed',
        fields: [
          { field: 'zh.body', current: '编辑在 CMS 里同时修改了中文正文' },
        ],
      },
    },
  });
  expect(boardState(d.work)).toBe('review');
  expect(f.cms.state.requests.some((r) => r.action === 'update')).toBe(false);
  const releaseKey = d.work.flow.stages[d.work.stageIndex].key;
  await expect(
    f.command('retryPublish', { stageKey: releaseKey }),
  ).rejects.toThrow();
  d = await f.command('rebaseArticle', { stageKey: releaseKey });
  const rebased = review(d);
  expect(d.work.flow.stages[d.work.stageIndex].kind).toBe('review');
  expect(rebased.article).toMatchObject({
    conflicts: [
      { field: 'zh.body', current: '编辑在 CMS 里同时修改了中文正文' },
    ],
    baseVersion: f.cms.state.rows[0].updatedAt,
  });
  expect(d.work.release).toBeUndefined();
  // The owner merges both versions by hand and approves again.
  d = await f.command('editArticleDraft', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: rebased.id,
    article: {
      locales: {
        zh: { body: '编辑在 CMS 里同时修改了中文正文\n\n加上 AI 的内链。' },
      },
    },
  });
  await f.command('approveStage', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: review(d).id,
    checked: [],
  });
  await f.settle();
  d = await f.view();
  expect(d.work.release.state).toBe('not_seen');
  expect(f.cms.state.rows[0].content_cn).toBe(
    '编辑在 CMS 里同时修改了中文正文\n\n加上 AI 的内链。',
  );
});

test('a failed publish is visible and retried idempotently; only the approved version is published', async () => {
  const f = await fixture();
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  await f.command('startTask', { playbookId: 'optimize-page' });
  f.cms.state.failNextWrite = '500-after-save';
  await draftAndApprove(f);
  let d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'publish_failed',
    article: { error: 'unknown_outcome' },
  });
  const approved = d.work.release.article.artifactId;
  await f.command('retryPublish', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
  });
  await f.settle();
  d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'verifying',
    article: { artifactId: approved, published: { adopted: true } },
  });
  expect(
    f.cms.state.requests.filter((r) => r.action === 'update'),
  ).toHaveLength(1);
});

test('a failed publish records where it stopped and why, logs it, and a retry clears it', async () => {
  const f = await fixture({ downstream: true });
  const warn = vi.fn();
  f.s.p.app.logger = { warn };
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  await f.command('startTask', { playbookId: 'optimize-page' });
  // GitHub rate-limits the check of the website repository.
  const github = f.git.fetcher;
  f.git.fetcher = async () =>
    new Response('{"message":"API rate limit exceeded"}', { status: 429 });
  await draftAndApprove(f);
  let d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'publish_failed',
    article: {
      error: 'unavailable',
      errorStep: 'downstream',
      errorDetail: 'github:429',
      errorAt: expect.any(String),
    },
  });
  expect(f.cms.state.requests.some((r) => r.action === 'update')).toBe(false);
  expect(warn).toHaveBeenCalledWith('NocoReach article publish failed', {
    projectId: '1',
    taskId: '1',
    targetId: 'cms',
    step: 'downstream',
    code: 'unavailable',
    detail: 'github:429',
  });
  f.git.fetcher = github;
  await f.command('retryPublish', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
  });
  await f.settle();
  d = await f.view();
  expect(d.work.release.state).toBe('exporting');
  for (const key of ['error', 'errorStep', 'errorDetail', 'errorAt'])
    expect(d.work.release.article[key]).toBeUndefined();
});

test('an unexpected error while publishing keeps its name and message', async () => {
  const f = await fixture();
  const warn = vi.fn();
  f.s.p.app.logger = { warn };
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  await f.command('startTask', { playbookId: 'optimize-page' });
  const update = vi
    .spyOn(NocoBaseArticles.prototype, 'update')
    .mockRejectedValueOnce(
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    );
  try {
    await draftAndApprove(f);
  } finally {
    update.mockRestore();
  }
  const d = await f.view();
  const detail =
    "TypeError: Cannot read properties of undefined (reading 'id')";
  expect(d.work.release).toMatchObject({
    state: 'publish_failed',
    article: { error: 'unavailable', errorStep: 'write', errorDetail: detail },
  });
  expect(warn).toHaveBeenCalledWith(
    'NocoReach article publish failed',
    expect.objectContaining({ targetId: 'cms', step: 'write', detail }),
  );
});

test('downstream export: publishing waits for the exporter, and an overwrite afterwards is shown on the task', async () => {
  const f = await fixture({ downstream: true });
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  await f.command('startTask', { playbookId: 'optimize-page' });
  await draftAndApprove(f);
  let d = await f.view();
  expect(d.work.release.state).toBe('exporting');
  // Not exported yet.
  d.work.release.nextCheckAt = new Date(0).toISOString();
  f.state.nrTasks[0].evidence.work.release.nextCheckAt = new Date(
    0,
  ).toISOString();
  await f.s.articleFlow.tick();
  expect((await f.view()).work.release.state).toBe('exporting');
  f.git.push(
    { 'content/articles/hello/index.cn.md': f.cms.state.rows[0].content_cn },
    EXPORTER,
  );
  f.state.nrTasks[0].evidence.work.release.nextCheckAt = new Date(
    0,
  ).toISOString();
  f.s.articleFlow.checked.clear();
  await f.s.articleFlow.tick();
  d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'verifying',
    article: { exported: { commit: expect.any(String) } },
  });
  // An editor saves an old form in the CMS after publishing: accepted risk (b), shown on the task.
  f.cms.edit(7, { content_cn: '# 你好\n\n中文正文' });
  f.s.articleFlow.checked.clear();
  await f.s.articleFlow.tick();
  d = await f.view();
  expect(d.work.release.article.drift).toMatchObject({
    fields: [{ field: 'zh.body', current: '# 你好\n\n中文正文' }],
  });
  expect(d.work.history.map((e) => e.action)).toContain('articleDrift');
});

test('a Git-only edit of the article blocks publishing until it is taken into the draft', async () => {
  const f = await fixture({ downstream: true });
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  await f.command('startTask', { playbookId: 'optimize-page' });
  f.git.push(
    {
      'content/articles/hello/index.md':
        '# Hello\n\nEnglish body with a link from PR #185',
    },
    { name: 'Person', email: 'p@example.com' },
  );
  await draftAndApprove(f);
  const d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'publish_conflict',
    article: {
      conflict: {
        reason: 'downstream',
        divergence: [
          { path: 'content/articles/hello/index.md', field: 'en.body' },
        ],
      },
    },
  });
  expect(f.cms.state.requests.some((r) => r.action === 'update')).toBe(false);
});

test('a blog post goes to the default target, and the task page marks it', async () => {
  const f = await fixture();
  const targets = f.s.p.articleTargets;
  // A target view carries hasSecret and capabilities; the saved settings must not.
  const { hasSecret, capabilities, ...cms } = targets.list('1').targets[0];
  void hasSecret;
  void capabilities;
  await targets.save('1', {
    revision: 1,
    secret: 'cms-key',
    target: { ...cms, id: 'other', name: 'Other CMS' },
  });
  expect((await f.view()).articleTargets.map((t) => [t.id, t.default])).toEqual(
    [
      ['cms', true],
      ['other', false],
    ],
  );
  await targets.setDefault('1', { revision: 2, id: 'other' });
  expect((await f.view()).articleTargets.find((t) => t.default).id).toBe(
    'other',
  );
  const d = await f.command('startTask', { playbookId: 'blog-post' });
  expect(d.work.delivery).toMatchObject({
    kind: 'article',
    targetId: 'other',
    articleId: null,
  });
});

test('a blog post becomes a new article on the target; a code change to exported files cannot be approved', async () => {
  const f = await fixture({ downstream: true });
  let d = await f.command('startTask', { playbookId: 'blog-post' });
  expect(d.work.delivery).toMatchObject({
    kind: 'article',
    targetId: 'cms',
    articleId: null,
  });
  let { run } = await claim(f);
  expect(run.input.article.action).toBe('create');
  // A draft for a locale the target does not have is not a usable result.
  const plugin = f.s.p.agents.records.get(
    f.state.nrSnapshots.find((r) => r.key.endsWith(run.id)).payload.pluginRunId,
  );
  plugin.status = 'completed';
  plugin.summary = JSON.stringify({
    ok: true,
    content: 'New post',
    article: {
      slug: 'new-post',
      locales: { fr: { title: 'Bonjour', body: 'Corps' } },
    },
  });
  await f.s.runtime.sync(
    f.state.nrSnapshots.find((r) => r.key.endsWith(run.id)).payload,
  );
  d = await f.view();
  expect(d.runs[0]).toMatchObject({
    status: 'failed',
    error: 'invalid_agent_result',
  });
  await f.command('retryStage', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
  });
  await draftAndApprove(f, {
    slug: 'new-post',
    status: 'draft',
    locales: { en: { title: 'A new post', body: 'Body of the new post' } },
    summary: 'New post',
  });
  d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'exporting',
    article: { published: { slug: 'new-post' } },
  });
  expect(f.cms.state.rows.find((r) => r.slug === 'new-post')).toMatchObject({
    status: 'drafted',
    title: 'A new post',
  });
  f.s.articleFlow.checked.clear();
  await f.s.articleFlow.tick();
  expect((await f.view()).work.release.article.drift).toBeUndefined();
  const created = f.cms.state.rows.find((r) => r.slug === 'new-post');
  f.cms.edit(created.id, { status: 'published' });
  f.s.articleFlow.checked.clear();
  await f.s.articleFlow.tick();
  expect((await f.view()).work.release.article.drift.fields).toEqual([
    { field: 'status', published: 'draft', current: 'published' },
  ]);
  f.cms.edit(created.id, { status: 'drafted' });
  f.s.articleFlow.checked.clear();
  await f.s.articleFlow.tick();
  expect((await f.view()).work.release.article.drift.resolvedAt).toEqual(
    expect.any(String),
  );

  // A code task in the same project: its PR edits a file the CMS exports.
  f.state.nrTasks.push({
    id: 2,
    projectId: '1',
    title: 'Code',
    brief: '',
    status: '待处理',
    evidence: {},
  });
  await f.s.agents.saveRepo('1', {
    repo: 'org/site',
    baseBranch: 'main',
    revision: 1,
  });
  const c = async (command, body = {}) =>
    f.s.update(
      '1',
      {
        taskId: '2',
        revision: (await f.s.get('1', '2')).work.revision,
        requestId: randomUUID(),
        command,
        ...body,
      },
      '1',
      'Tester',
    );
  d = await c('startTask', { playbookId: 'tech-fix', delivery: 'repo' });
  expect(d.work.delivery).toBeUndefined();
  ({ run } = await claim(f));
  expect(run.mode).toBe('plan');
  await finish(f, { taskId: '2', runId: run.id, ok: true, content: 'Plan' });
  d = await f.s.get('1', '2');
  await c('approveStage', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: d.work.results[d.work.stageIndex - 1].id,
    checked: [],
  });
  ({ run } = await claim(f));
  expect(run.input.protectedPaths).toEqual([
    'content/articles/{slug}/index.md',
    'content/articles/{slug}/index.cn.md',
  ]);
  await finish(f, {
    taskId: '2',
    runId: run.id,
    ok: true,
    content: 'Changed',
    pr: {
      url: 'https://github.com/org/site/pull/9',
      number: 9,
      branch: 'nocoreach/task-2',
      headSha: 'abc1234',
      files: [
        { path: 'content/articles/hello/index.md', additions: 1, deletions: 1 },
        { path: 'src/a.ts', additions: 1, deletions: 0 },
      ],
    },
  });
  d = await f.s.get('1', '2');
  expect(d.work.results[d.work.stageIndex - 1].pr.protected).toEqual([
    'content/articles/hello/index.md',
  ]);
  await expect(
    c('approveStage', {
      stageKey: d.work.flow.stages[d.work.stageIndex].key,
      artifactId: d.work.results[d.work.stageIndex - 1].id,
      checked: [],
    }),
  ).rejects.toMatchObject({ status: 409 });
});

// Several targets (docs/ARTICLE-PUBLISHING.md): one draft, reviewed once, published to each target separately.
const newsRow = () => ({
  id: 70,
  slug: 'hello',
  status: 'published',
  title: 'Hello (news)',
  description: 'News summary',
  content: 'News English body',
  content_cn: '新闻中文正文',
  updatedAt: '2026-10-16T00:00:00.000Z',
});
const multiDraft = {
  locales: {
    zh: { title: '新标题', body: '# 你好\n\n改写后的中文正文，包含新的内链。' },
    en: { description: 'A new summary' },
  },
  verifyText: '改写后的中文正文',
  summary: 'Rewrote the Chinese body',
};
const updates = (cms) =>
  cms.state.requests.filter((r) => r.action === 'update');
async function startBoth(f) {
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  return f.command('startTask', {
    playbookId: 'optimize-page',
    delivery: { also: ['news'] },
  });
}
async function approveCurrent(f) {
  const d = await f.view();
  await f.command('approveStage', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: review(d).id,
    checked: [],
  });
  await f.settle();
  return f.view();
}

test('several targets: the same slug elsewhere is updated, fields it cannot hold are left out, and both publish', async () => {
  const f = await fixture({ news: [newsRow()] });
  let d = await startBoth(f);
  expect(d.work.delivery).toMatchObject({
    targetId: 'cms',
    articleId: '7',
    also: [
      { targetId: 'news', articleId: '70', sourceKey: expect.any(String) },
    ],
  });
  const { run } = await claim(f);
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: '改了中文正文。',
    article: multiDraft,
  });
  d = await f.view();
  expect(review(d).article.changes).toEqual([
    'en.description',
    'zh.body',
    'zh.title',
  ]);
  expect(review(d).article.also).toEqual([
    expect.objectContaining({
      targetId: 'news',
      articleId: '70',
      baseVersion: '2026-10-16T00:00:00.000Z',
      changes: ['en.description', 'zh.body'],
      skipped: ['zh.title'],
      slug: 'hello',
      title: 'Hello (news)',
    }),
  ]);
  d = await approveCurrent(f);
  expect(d.work.release).toMatchObject({
    state: 'verifying',
    article: { state: 'published', published: { articleId: '7' } },
    also: [
      {
        targetId: 'news',
        state: 'published',
        published: { articleId: '70', written: ['en.description', 'zh.body'] },
      },
    ],
  });
  expect(d.work.release.pages).toEqual([
    'https://www.example.com/en/blog/hello',
    'https://www.example.com/cn/blog/hello',
    'https://news.example.com/hello',
  ]);
  expect(updates(f.news)[0].body).toEqual({
    description: 'A new summary',
    content_cn: '# 你好\n\n改写后的中文正文，包含新的内链。',
  });
  expect(updates(f.cms)).toHaveLength(1);
});

test('several targets: a conflict on one does not stop the other; rebasing does not write the published one again', async () => {
  const f = await fixture({ news: [newsRow()] });
  await startBoth(f);
  f.news.edit(70, { content_cn: '新闻编辑改了中文' });
  const { d: approved } = await draftAndApprove(f, multiDraft);
  void approved;
  let d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'publish_conflict',
    article: { state: 'published' },
    also: [
      {
        state: 'publish_conflict',
        conflict: {
          reason: 'changed',
          fields: [{ field: 'zh.body', current: '新闻编辑改了中文' }],
        },
      },
    ],
  });
  expect(updates(f.cms)).toHaveLength(1);
  expect(updates(f.news)).toHaveLength(0);
  d = await f.command('rebaseArticle', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
  });
  const next = review(d).article;
  // The primary is based on what it published, so it holds no change of its own; its fields stay tracked.
  expect(next.changes).toEqual([]);
  expect(next.carried).toEqual(['en.description', 'zh.body', 'zh.title']);
  expect(next.also[0]).toMatchObject({
    articleId: '70',
    changes: ['en.description', 'zh.body'],
    conflicts: [{ field: 'zh.body', current: '新闻编辑改了中文' }],
  });
  d = await approveCurrent(f);
  expect(d.work.release).toMatchObject({
    state: 'verifying',
    article: {
      state: 'published',
      published: {
        adopted: true,
        written: ['en.description', 'zh.body', 'zh.title'],
      },
    },
    also: [{ state: 'published' }],
  });
  expect(updates(f.cms)).toHaveLength(1);
  expect(updates(f.news)).toHaveLength(1);
});

test('several targets: a failure on one is retried alone', async () => {
  const f = await fixture({ news: [newsRow()] });
  await startBoth(f);
  f.news.state.failNextWrite = 'timeout';
  await draftAndApprove(f, multiDraft);
  let d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'publish_failed',
    article: { state: 'published' },
    also: [{ state: 'publish_failed', error: expect.any(String) }],
  });
  await f.command('retryPublish', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
  });
  await f.settle();
  d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'verifying',
    also: [{ state: 'published' }],
  });
  expect(updates(f.cms)).toHaveLength(1);
  expect(f.news.state.rows[0].content_cn).toBe(
    '# 你好\n\n改写后的中文正文，包含新的内链。',
  );
});

test('several targets: a new article whose slug is taken elsewhere becomes an update of that article after review', async () => {
  const f = await fixture({ news: [{ ...newsRow(), slug: 'new-post' }] });
  let d = await f.command('startTask', {
    playbookId: 'blog-post',
    delivery: { targetId: 'cms', also: ['news'] },
  });
  expect(d.work.delivery).toMatchObject({
    targetId: 'cms',
    articleId: null,
    also: [{ targetId: 'news', articleId: null, sourceKey: null }],
  });
  await draftAndApprove(f, {
    slug: 'new-post',
    locales: {
      en: { title: 'A new post', body: 'Body of the new post' },
      ja: { title: '新しい', body: '本文' },
    },
    summary: 'New post',
  });
  d = await f.view();
  expect(d.work.results.find((r) => r?.article)?.article.also[0]).toMatchObject(
    { articleId: null, skipped: ['ja'] },
  );
  expect(d.work.release).toMatchObject({
    state: 'publish_conflict',
    article: { state: 'published' },
    also: [{ state: 'publish_conflict', conflict: { reason: 'slug_taken' } }],
  });
  d = await f.command('rebaseArticle', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
  });
  expect(review(d).article.also[0]).toMatchObject({
    articleId: '70',
    slug: 'new-post',
    title: 'Hello (news)',
  });
  expect(d.work.delivery.also).toEqual([
    { targetId: 'news', articleId: '70', sourceKey: expect.any(String) },
  ]);
  d = await approveCurrent(f);
  expect(d.work.release.state).not.toMatch(/^publish/);
  expect(
    f.cms.state.requests.filter((r) => r.action === 'create'),
  ).toHaveLength(1);
  expect(
    f.news.state.requests.filter((r) => r.action === 'create'),
  ).toHaveLength(0);
  expect(f.news.state.rows[0]).toMatchObject({
    title: 'A new post',
    content: 'Body of the new post',
  });
});

test('several targets: limits and unreadable targets stop the start', async () => {
  const f = await fixture({ news: [newsRow()] });
  await expect(
    f.command('startTask', {
      playbookId: 'blog-post',
      delivery: { targetId: 'cms', also: ['a', 'b', 'c', 'd', 'e'] },
    }),
  ).rejects.toMatchObject({ status: 400 });
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  const provider = f.s.p.articles.provider;
  f.s.p.articles.provider = (project, id) =>
    id === 'news'
      ? {
          findBySlug: async () => {
            throw new Error('down');
          },
        }
      : provider.call(f.s.p.articles, project, id);
  await expect(
    f.command('startTask', {
      playbookId: 'optimize-page',
      delivery: { also: ['news'] },
    }),
  ).rejects.toMatchObject({
    status: 502,
    message: expect.stringContaining('News'),
  });
  f.s.p.articles.provider = provider;
  expect((await f.view()).work.flow).toBeFalsy();
});

test('per-playbook targets: a playbook goes to its target, the repository, or the default', async () => {
  const f = await fixture({ news: [newsRow()] });
  const targets = f.articleTargets;
  await expect(
    targets.savePlaybooks('1', { revision: 1, playbookTargets: {} }),
  ).rejects.toThrow('articles.stale');
  await expect(
    targets.savePlaybooks('1', {
      revision: 2,
      playbookTargets: { 'blog-post': 'gone' },
    }),
  ).rejects.toThrow('articles.invalidPlaybookTargets');
  await targets.savePlaybooks('1', {
    revision: 2,
    playbookTargets: { 'blog-post': 'news', 'optimize-page': 'repo' },
  });
  expect((await f.view()).articlePlaybookTargets).toEqual({
    'blog-post': 'news',
    'optimize-page': 'repo',
  });
  const d = await f.command('startTask', { playbookId: 'blog-post' });
  expect(d.work.delivery).toMatchObject({ targetId: 'news', articleId: null });
  // A playbook mapped to the repository keeps the pull request, even with targets configured.
  const w = { article: undefined };
  await f.s.articleFlow.startDelivery(
    '1',
    '1',
    w,
    'optimize-page',
    true,
    undefined,
    null,
  );
  expect(w.delivery).toBeUndefined();
  // Removing a target drops the entries that name it.
  await targets.remove('1', { revision: 3, id: 'news' });
  expect(targets.list('1').playbookTargets).toEqual({
    'optimize-page': 'repo',
  });
});

test('several targets: verification waits for every export, and an overwrite on another target names it', async () => {
  const f = await fixture({ downstream: true, news: [newsRow()] });
  await startBoth(f);
  await draftAndApprove(f, multiDraft);
  let d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'exporting',
    article: { state: 'exporting' },
    also: [{ state: 'published' }],
  });
  f.git.push(
    {
      'content/articles/hello/index.cn.md': f.cms.state.rows[0].content_cn,
      'content/articles/hello/index.md': f.cms.state.rows[0].content,
    },
    EXPORTER,
  );
  f.state.nrTasks[0].evidence.work.release.nextCheckAt = new Date(
    0,
  ).toISOString();
  await f.s.articleFlow.tick();
  d = await f.view();
  expect(d.work.release).toMatchObject({
    state: 'verifying',
    article: { state: 'exported', exported: { commit: expect.any(String) } },
  });
  f.news.edit(70, { content_cn: '新闻编辑又改回了' });
  f.s.articleFlow.checked.clear();
  await f.s.articleFlow.tick();
  d = await f.view();
  expect(d.work.release.article.drift).toBeUndefined();
  expect(d.work.release.also[0].drift).toMatchObject({
    fields: [{ field: 'zh.body', current: '新闻编辑又改回了' }],
  });
});

// 2026-10-24 user request: the primary language first, the others translated once it is approved, and one Publish
// for all of them.
test('languages: the primary is written and approved first, then translated, and one publish writes every language', async () => {
  const f = await fixture();
  let d = await f.command('startTask', {
    playbookId: 'blog-post',
    delivery: { targetId: 'cms', locales: ['en', 'zh', 'fr'] },
  });
  // A language the target does not have is left out.
  expect(d.work.delivery.locales).toEqual(['en', 'zh']);
  let { run } = await claim(f);
  expect(run.input.article.languages).toMatchObject({
    primary: 'en',
    others: ['zh'],
    phase: 'primary',
    write: ['en'],
  });
  // What the Agent writes beyond the primary is left for the translation.
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: 'New post',
    article: {
      slug: 'new-post',
      locales: {
        en: { title: 'A new post', body: 'Body of the new post' },
        zh: { title: '新文章', body: '正文' },
      },
      summary: 'New post',
    },
  });
  d = await f.view();
  expect(Object.keys(review(d).article.draft.locales)).toEqual(['en']);
  d = await f.command('approveStage', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: review(d).id,
    checked: [],
  });
  // Approving the primary publishes nothing yet: the Agent translates it.
  expect(d.work.flow.stages[d.work.stageIndex].kind).toBe('agent');
  expect(d.work.release).toBeUndefined();
  expect(d.work.delivery.translateFrom).toMatchObject({
    text: { title: 'A new post', body: 'Body of the new post' },
    fields: ['title', 'body'],
  });
  ({ run } = await claim(f));
  expect(run.input.article.languages).toMatchObject({
    phase: 'translate',
    write: ['zh'],
    approved: { title: 'A new post', body: 'Body of the new post' },
  });
  // The translation adds the other language; the primary stays as approved.
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: 'Translated',
    article: {
      locales: {
        en: { title: 'Changed while translating' },
        zh: { title: '一篇新文章', body: '新文章的正文' },
      },
      summary: 'Translated into Chinese',
    },
  });
  d = await f.view();
  expect(review(d).article.draft).toMatchObject({
    slug: 'new-post',
    summary: 'Translated into Chinese',
    locales: {
      en: { title: 'A new post', body: 'Body of the new post' },
      zh: { title: '一篇新文章', body: '新文章的正文' },
    },
  });
  d = await f.command('approveStage', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: review(d).id,
    checked: [],
  });
  await f.settle();
  expect(f.cms.state.rows.find((r) => r.slug === 'new-post')).toMatchObject({
    title: 'A new post',
    title_cn: '一篇新文章',
    content_cn: '新文章的正文',
  });
});

// 2026-10-27 (T-47): with the project, the brief and the outline in Chinese, the Agent wrote a Chinese-only new article
// for a target whose first language is English, and read the rejection (locale:en) as a setting to fix.
test('languages: without a choice, the first language of the target is named the primary; a draft in another language comes back in plain words', async () => {
  const f = await fixture();
  const d = await f.command('startTask', { playbookId: 'blog-post' });
  // Every language is still written at once, as before.
  expect(d.work.delivery.locales).toBeUndefined();
  const { run } = await claim(f);
  expect(run.input.article.languages).toEqual({
    primary: 'en',
    others: ['zh', 'ja'],
    phase: 'all',
    write: ['en', 'zh', 'ja'],
  });
  // The project language is the one for notes, not the article's.
  expect(run.input.language).toBe('zh-CN');
  const stored = f.state.nrSnapshots.find((row) =>
    row.key.endsWith(run.id),
  ).payload;
  const result = (locales) => ({
    ok: true,
    content: '写了一篇新文章。',
    article: { slug: 'agent-governance', locales, summary: '新文章' },
  });
  // What `task result` answers, so the Agent can rewrite and submit again.
  await expect(
    f.s.validateAgentResult(
      stored,
      result({ zh: { title: 'AI Agent 治理平台', body: '中文正文' } }),
    ),
  ).rejects.toMatchObject({
    status: 422,
    message: '新文章必须有英语（en）的标题和正文，这次只写了：中文（zh）。',
  });
  await expect(
    f.s.validateAgentResult(stored, result({ en: { title: 'Governance' } })),
  ).rejects.toMatchObject({
    message: '新文章的英语（en）要同时有标题和正文，这次缺少 body。',
  });
  await expect(
    f.s.validateAgentResult(
      stored,
      result({ fr: { title: 'Gouvernance', body: 'Texte' } }),
    ),
  ).rejects.toMatchObject({
    message:
      '发布目标“NocoBase CMS”没有法语（fr），只能写：英语（en）、中文（zh）、日语（ja）。',
  });
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ...result({
      en: { title: 'AI agent governance', body: 'English body' },
      zh: { title: 'AI Agent 治理平台', body: '中文正文' },
    }),
  });
  expect(Object.keys(review(await f.view()).article.draft.locales)).toEqual([
    'en',
    'zh',
  ]);
});

test('languages: a new article in a primary chosen at start other than the first language of the target is accepted, then translated', async () => {
  const f = await fixture({ news: [newsRow()] });
  let d = await f.command('startTask', {
    playbookId: 'blog-post',
    delivery: { targetId: 'cms', locales: ['zh', 'en'], also: ['news'] },
  });
  expect(d.work.delivery.locales).toEqual(['zh', 'en']);
  let { run } = await claim(f);
  expect(run.input.article.languages).toMatchObject({
    primary: 'zh',
    phase: 'primary',
    write: ['zh'],
  });
  // English while this step writes Chinese only: said as such, instead of an empty draft.
  await expect(
    finish(f, {
      taskId: '1',
      runId: run.id,
      ok: true,
      content: 'Wrote it',
      article: {
        slug: 'zh-first',
        locales: { en: { title: 'Chinese first', body: 'English body' } },
        summary: 'New post',
      },
    }),
  ).rejects.toMatchObject({
    status: 422,
    message:
      '这一步只写主语言中文（zh），其他语言在审核通过后再翻译；这次只写了：英语（en）。',
  });
  // The other target is checked once the translation is in: English is still to come.
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: '写了中文版。',
    article: {
      slug: 'zh-first',
      locales: { zh: { title: '中文在先', body: '中文正文' } },
      summary: '新文章',
    },
  });
  d = await f.view();
  expect(Object.keys(review(d).article.draft.locales)).toEqual(['zh']);
  // The person editor keeps the same rule: the primary needs both a title and a body.
  await expect(
    f.command('editArticleDraft', {
      stageKey: d.work.flow.stages[d.work.stageIndex].key,
      artifactId: review(d).id,
      article: { slug: 'zh-first', locales: { zh: { title: '中文在先' } } },
    }),
  ).rejects.toMatchObject({
    status: 400,
    message: '新文章的中文（zh）要同时有标题和正文，这次缺少 body。',
  });
  d = await f.command('approveStage', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: review(d).id,
    checked: [],
  });
  ({ run } = await claim(f));
  expect(run.input.article.languages).toMatchObject({
    phase: 'translate',
    write: ['en'],
  });
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: 'Translated',
    article: {
      locales: { en: { title: 'Chinese first', body: 'English body' } },
      summary: 'Translated into English',
    },
  });
  d = await approveCurrent(f);
  expect(d.work.release.state).not.toMatch(/^publish/);
  expect(f.cms.state.rows.find((r) => r.slug === 'zh-first')).toMatchObject({
    title: 'Chinese first',
    content: 'English body',
    title_cn: '中文在先',
    content_cn: '中文正文',
  });
  expect(f.news.state.rows.find((r) => r.slug === 'zh-first')).toMatchObject({
    title: 'Chinese first',
    content: 'English body',
    content_cn: '中文正文',
  });
});

// 2026-10-28 (T-53): updating an existing article re-translated the whole new English into the other languages, and a
// primary-only file the Agent submitted by mistake passed as the translation, with Chinese and Japanese unchanged.
test('languages: an update edits the languages the article has with the primary changes, translates the one it lacks, and refuses a result without them', async () => {
  const f = await fixture();
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  let d = await f.command('startTask', {
    playbookId: 'optimize-page',
    delivery: { locales: ['en', 'zh', 'ja'] },
  });
  let { run } = await claim(f);
  expect(run.input.article.languages.phase).toBe('primary');
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: 'Changed the English title and added a paragraph.',
    article: {
      locales: {
        en: {
          title: 'Hello, world',
          body: '# Hello\n\nEnglish body\n\nA new paragraph',
        },
      },
      summary: 'New title',
    },
  });
  d = await approveCurrent(f);
  // Chinese is there already: it is updated in place, and the approval says so.
  expect(
    d.work.history.filter((e) => e.action === 'approveStage').at(-1),
  ).toMatchObject({
    action: 'approveStage',
    note: 'update',
  });
  ({ run } = await claim(f));
  expect(run.input.article.languages).toEqual({
    primary: 'en',
    others: ['zh', 'ja'],
    phase: 'update',
    write: ['zh', 'ja'],
    // The whole approved text, for the language the article lacks.
    approved: {
      title: 'Hello, world',
      description: 'Old summary',
      body: '# Hello\n\nEnglish body\n\nA new paragraph',
      fields: ['title', 'description', 'body'],
    },
    update: ['zh'],
    translate: ['ja'],
    // What the primary changed, for Chinese to get the same edits.
    changes: [
      { field: 'title', before: 'Hello', after: 'Hello, world' },
      {
        field: 'body',
        edits: [{ near: 'English body', before: '', after: 'A new paragraph' }],
      },
    ],
  });
  // Chinese is edited from its own current text, in the source.
  expect(run.input.article.source.locales.zh).toMatchObject({ title: '你好' });
  const stored = f.state.nrSnapshots.find((row) =>
    row.key.endsWith(run.id),
  ).payload;
  // The primary-only file of the earlier run: refused in words, so the Agent submits what it wrote this time.
  await expect(
    f.s.validateAgentResult(stored, {
      ok: true,
      content: 'Changed the English title.',
      article: {
        locales: { en: { title: 'Hello, world' } },
        summary: 'New title',
      },
    }),
  ).rejects.toMatchObject({
    status: 422,
    message:
      '这一步要写中文（zh）、日语（ja），英语（en）已经审核通过，不用再写；这次只写了：英语（en）。',
  });
  // Chinese as it was, Japanese not written: accepted, and the review shows that nothing changed in them.
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: 'Nothing to change.',
    article: { locales: { zh: { title: '你好' } }, summary: 'No changes' },
  });
  d = await f.view();
  expect(
    review(d).article.changes.filter((c) => !c.startsWith('en.')),
  ).toEqual([]);
  // Done again (the card's Update again): still an update in place.
  await f.command('requestStageChanges', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: review(d).id,
    comment: 'Chinese and Japanese did not change.',
  });
  ({ run } = await claim(f));
  expect(run.input.article.languages).toMatchObject({
    phase: 'update',
    update: ['zh'],
    translate: ['ja'],
  });
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: 'Updated Chinese and translated Japanese.',
    article: {
      locales: {
        zh: {
          title: '你好，世界',
          body: '# 你好\n\n中文正文\n\n新的一段',
        },
        ja: {
          title: 'こんにちは、世界',
          description: '古い要約',
          body: '# こんにちは\n\n英語の本文\n\n新しい段落',
        },
      },
      summary: 'Updated Chinese',
    },
  });
  d = await f.view();
  expect([...review(d).article.changes].sort()).toEqual([
    'en.body',
    'en.title',
    'ja.body',
    'ja.description',
    'ja.title',
    'zh.body',
    'zh.title',
  ]);
  d = await approveCurrent(f);
  expect(f.cms.state.rows.find((r) => r.slug === 'hello')).toMatchObject({
    title: 'Hello, world',
    description: 'Old summary',
    title_cn: '你好，世界',
    description_cn: '旧摘要',
    content_cn: '# 你好\n\n中文正文\n\n新的一段',
    title_ja: 'こんにちは、世界',
  });
});

test('languages: a new article and an update of an article without the other languages translate the whole approved text', async () => {
  const f = await fixture();
  // The article has English and Chinese; only Japanese is written after English.
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  await f.command('startTask', {
    playbookId: 'optimize-page',
    delivery: { locales: ['en', 'ja'] },
  });
  let { run } = await claim(f);
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: 'New title',
    article: { locales: { en: { title: 'Hello, world' } }, summary: 'Title' },
  });
  const d = await approveCurrent(f);
  expect(
    d.work.history.filter((e) => e.action === 'approveStage').at(-1),
  ).toMatchObject({
    action: 'approveStage',
    note: 'translate',
  });
  ({ run } = await claim(f));
  // Every field, not only the title the primary changed: Japanese is not there yet.
  expect(run.input.article.languages).toEqual({
    primary: 'en',
    others: ['ja'],
    phase: 'translate',
    write: ['ja'],
    approved: {
      title: 'Hello, world',
      description: 'Old summary',
      body: '# Hello\n\nEnglish body',
      fields: ['title', 'description', 'body'],
    },
  });
});

test('translation: the published article is translated into the languages it lacks, the source is kept, one publish writes them', async () => {
  const f = await fixture();
  let d = await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  // The languages the article has text in (Japanese is empty).
  expect(d.work.article.locales).toEqual(['en', 'zh']);
  d = await f.command('startTask', { playbookId: 'sync-translations' });
  expect(d.work.flow.stages.map((s) => s.kind)).toEqual([
    'agent',
    'review',
    'release',
    'observe',
  ]);
  // Without a choice: from the target's first language the article has into the one it lacks. The article as
  // published stands in for an approved primary, so the first run already translates.
  expect(d.work.delivery).toMatchObject({
    kind: 'article',
    targetId: 'cms',
    articleId: '7',
    locales: ['en', 'ja'],
    translateFrom: {
      artifactId: null,
      published: true,
      by: '1',
      text: {
        title: 'Hello',
        description: 'Old summary',
        body: '# Hello\n\nEnglish body',
      },
      fields: ['title', 'description', 'body'],
    },
  });
  const { run } = await claim(f);
  expect(run.mode).toBe('article');
  expect(run.input.article.languages).toMatchObject({
    primary: 'en',
    others: ['ja'],
    phase: 'translate',
    write: ['ja'],
    approved: { title: 'Hello', fields: ['title', 'description', 'body'] },
  });
  // What the Agent writes in the source language is left out: only the translation is proposed.
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: 'Translated into Japanese',
    article: {
      locales: {
        en: { title: 'Changed while translating' },
        ja: {
          title: 'こんにちは',
          description: '要約',
          body: '# こんにちは\n\n本文',
        },
      },
      summary: 'Translated into Japanese',
    },
  });
  d = await f.view();
  expect(review(d).article.draft.locales).toEqual({
    ja: {
      title: 'こんにちは',
      description: '要約',
      body: '# こんにちは\n\n本文',
    },
  });
  expect([...review(d).article.changes].sort()).toEqual([
    'ja.body',
    'ja.description',
    'ja.title',
  ]);
  d = await f.command('approveStage', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: review(d).id,
    checked: [],
  });
  // One approval publishes: there is no primary round to approve first.
  expect(d.work.release.state).toBe('publishing');
  await f.settle();
  expect(f.cms.state.rows.find((r) => r.slug === 'hello')).toMatchObject({
    title: 'Hello',
    content: '# Hello\n\nEnglish body',
    title_cn: '你好',
    title_ja: 'こんにちは',
    content_ja: '# こんにちは\n\n本文',
  });
});

test('translation: chosen languages bring a translation up to date; changes requested stay a translation', async () => {
  const f = await fixture();
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  // The other targets and the repository choice do not apply: a translation goes to the article's own target.
  let d = await f.command('startTask', {
    playbookId: 'sync-translations',
    delivery: { locales: ['zh', 'en'], also: ['news'] },
  });
  expect(d.work.delivery.also).toBeUndefined();
  expect(d.work.delivery.locales).toEqual(['zh', 'en']);
  expect(d.work.delivery.translateFrom.text.title).toBe('你好');
  let { run } = await claim(f);
  expect(run.input.article.languages).toMatchObject({
    phase: 'translate',
    write: ['en'],
  });
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: 'Updated the English translation',
    article: {
      locales: { en: { body: '# Hello\n\nUpdated English body' } },
      summary: 'Updated English',
    },
  });
  d = await f.view();
  await f.command('requestStageChanges', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: review(d).id,
    comment: 'Keep the heading as it was',
  });
  ({ run } = await claim(f));
  expect(run.input.article.languages).toMatchObject({
    phase: 'translate',
    write: ['en'],
  });
});

test('translation: a new article, a source without text or nothing to translate stops the start', async () => {
  const f = await fixture();
  await expect(
    f.command('startTask', {
      playbookId: 'sync-translations',
      delivery: { targetId: 'cms' },
    }),
  ).rejects.toMatchObject({ status: 409 });
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  await expect(
    f.command('startTask', {
      playbookId: 'sync-translations',
      delivery: { locales: ['ja', 'en'] },
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    f.command('startTask', {
      playbookId: 'sync-translations',
      delivery: { locales: ['en'] },
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect((await f.view()).work.flow).toBeFalsy();
  // Another playbook on the same article keeps the earlier behaviour: nothing is translated at start.
  const d = await f.command('startTask', { playbookId: 'optimize-page' });
  expect(d.work.delivery.translateFrom).toBeUndefined();
});

// Accept and start (2026-10-24): an accepted outline handed over to a blog post starts at once, as a new article on the
// default target; a new docs page with no page to find its article waits for a person to pick one.
async function acceptOutline(f, next) {
  await f.command('startTask', { playbookId: 'content-outline' });
  const { run } = await claim(f);
  expect(run.mode).toBe('plan');
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: '# Outline',
  });
  const d = await f.view();
  return f.command('approveStage', {
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    artifactId: review(d).id,
    checked: ['facts'],
    next,
  });
}

test('Accept and start: a blog post handed over from an outline starts as a new article on the default target', async () => {
  const f = await fixture({ news: [] });
  const d = await acceptOutline(f, 'blog-post');
  expect(d.work.stage).toBe('done');
  const child = await f.s.get('1', d.work.nextTaskId);
  // The start card's languages: every language of the target, its first as the primary (2026-10-27).
  expect(child.work.delivery).toMatchObject({
    kind: 'article',
    targetId: 'cms',
    articleId: null,
    locales: ['en', 'zh', 'ja'],
  });
  expect(child.runs).toEqual([
    expect.objectContaining({ status: 'queued', mode: 'article' }),
  ]);
  const { run } = await claim(f);
  expect(run.input.article.languages).toMatchObject({
    primary: 'en',
    phase: 'primary',
    write: ['en'],
  });
  expect(d.related).toEqual([
    expect.objectContaining({ relation: 'next', state: 'doing' }),
  ]);
});

test('Accept and start: a new docs page with no article found from its page waits at Start after review', async () => {
  const f = await fixture();
  const d = await acceptOutline(f, 'new-doc');
  expect(d.work.stage).toBe('done');
  const child = await f.s.get('1', d.work.nextTaskId);
  expect(child.work.flow).toBeUndefined();
  expect(child.work.delivery).toBeUndefined();
  expect(child.runs).toEqual([]);
  expect(d.related).toEqual([
    expect.objectContaining({ relation: 'next', state: 'todo' }),
  ]);
});
