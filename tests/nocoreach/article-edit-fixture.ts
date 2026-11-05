import { randomUUID } from 'node:crypto';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import { ArticleTargets } from '../../server/nocoreach/articles/targets.js';
import { ArticleDelivery } from '../../server/nocoreach/articles/delivery.js';
import { ARTICLE_TARGET_PRESETS } from '../../shared/article-publishing.js';
import { fakeAgents, selectAgent, claim, finish } from './agents-fixture';
import { fakeNocoBase } from './article-fakes.js';

// The article-flow.test.ts fixture (one CMS target), with snapshot deletion and three people: the owner (1, an
// administrator), a member (2) and another administrator (3).
export async function articleFixture() {
  const state = {
    nrTasks: [
      {
        id: 1,
        projectId: '1',
        title: 'Improve the hello post',
        brief: 'Rewrite the Chinese body for clarity',
        status: '待处理',
        evidence: {
          page: 'https://www.example.com/cn/blog/hello',
          autoTitle: { subject: 'hello world' },
        },
      },
    ],
    nrSnapshots: [],
    users: [
      { id: 1, username: 'tester', roles: [{ name: 'admin' }] },
      { id: 2, username: 'member', roles: [{ name: 'nr.member' }] },
      { id: 3, username: 'second', roles: [{ name: 'nr.admin' }] },
    ],
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
    destroy: async ({ filter }) => {
      const before = state[name].length;
      state[name] = state[name].filter((r) => !match(r, filter));
      return before - state[name].length;
    },
  });
  let tail = Promise.resolve();
  const values = new Map();
  const variables = {
    get: (k) => values.get(k),
    set: async (k, v) => values.set(k, v),
    cannotRead: () => false,
  };
  const cms = fakeNocoBase([
    {
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
    },
  ]);
  const articleTargets = new ArticleTargets(variables, () => cms.fetcher);
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
    },
  });
  const p = {
    agents: fakeAgents(),
    articleTargets,
    articles: new ArticleDelivery(articleTargets),
    project: async (id) => {
      if (id !== '1') throw Object.assign(Error('project'), { status: 404 });
      return {
        name: 'Synthetic',
        writingStyle: 'Plain',
        terminology: 'Say "workspace", never "space"',
      };
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
  const command = async (command, body = {}, actor = '1') =>
    s.update(
      '1',
      {
        taskId: '1',
        revision: (await s.get('1', '1')).work.revision,
        requestId: randomUUID(),
        command,
        ...body,
      },
      actor,
      'Tester',
    );
  const view = () => s.get('1', '1');
  await selectAgent({ s });
  const f = { s, state, cms, command, view };
  return f;
}

export const review = (d) => d.work.results[d.work.stageIndex - 1];

/** The task started on the CMS article, with the Agent's first version under review. */
export async function underReview(
  f,
  body = '# 你好\n\n第一段。\n\n第二段。\n\n第三段。',
) {
  await f.command('linkArticle', { targetId: 'cms', articleId: '7' });
  await f.command('startTask', { playbookId: 'optimize-page' });
  const { run } = await claim(f);
  await finish(f, {
    taskId: '1',
    runId: run.id,
    ok: true,
    content: '改了中文正文。',
    article: { locales: { zh: { body } }, summary: 'First version' },
  });
  const d = await f.view();
  return {
    d,
    stageKey: d.work.flow.stages[d.work.stageIndex].key,
    v1: review(d),
  };
}
