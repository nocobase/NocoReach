import { fakeAgents, selectAgent, claim, finish } from './agents-fixture';
import { test, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import { ArticleTargets } from '../../server/nocoreach/articles/targets.js';
import { ArticleDelivery } from '../../server/nocoreach/articles/delivery.js';
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
async function fixture({ downstream = false } = {}) {
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
  const articleTargets = new ArticleTargets(variables, (_id, connection) =>
    connection === 'github' ? git.fetcher : cms.fetcher,
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
  return { s, state, cms, git, command, view, settle };
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
    }),
  ]);
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
