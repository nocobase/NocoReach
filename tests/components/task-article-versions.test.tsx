import { NavigationGuardProvider } from '@nocobase/app-client';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import { TaskDetail } from '../../client/pages/task-detail';
import type {
  Artifact,
  TaskData,
} from '../../client/pages/task-execution-types';

// Every version of an article can be opened from Activity and an earlier one restored (2026-11-04, T-62: the owner
// wanted back the version they had edited by hand, could neither open nor restore it, and rebuilt it by hand).

const { action, me } = vi.hoisted(() => ({
  action: vi.fn(),
  me: { canEdit: true },
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => {
  const module =
    await original<typeof import('../../client/lib/nocoreach-api')>();
  return {
    ...module,
    nocobaseClient: { ...module.nocobaseClient, action, wrapRequests: vi.fn() },
  };
});
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: '1' }, can: () => me.canEdit }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));

const TITLE = '从 AI Coding 到应用治理：企业如何管理不断增长的内部应用？';
const SUMMARY =
  '随着 AI Coding 降低企业内部应用的开发门槛，重复建设也逐渐显现。';
const body = (intro: string) =>
  `## 引言\n\n${intro}\n\n不同部门各自开发 CRM、工单或审批工具。`;

// A new article in Chinese as T-62 went: the Agent's versions 1 to 3, the owner's 4 and 5, the Agent's 6 (asked for
// screenshots, it rewrote the article) and 7, then the owner's 8 to 10, which waits for review.
function version(
  n: number,
  by: 'agent' | '1',
  intro: string,
  at: string,
): Artifact {
  return {
    id: `v${n}`,
    stepId: 'write',
    planVersion: 0,
    version: n,
    content: by === 'agent' ? `第 ${n} 版的修改说明` : '第 3 版的修改说明',
    createdAt: at,
    createdBy: by,
    rejectedAt: n < 10 ? '2026-11-03T15:50:00Z' : undefined,
    article: {
      targetId: 'cms',
      articleId: null,
      baseKey: null,
      baseVersion: null,
      draft: {
        slug: 'ai-coding-app-governance',
        locales: {
          zh: { title: TITLE, description: SUMMARY, body: body(intro) },
        },
      },
      changes: ['slug', 'zh.title', 'zh.description', 'zh.body'],
    },
  };
}
const INTROS: [number, 'agent' | '1', string, string][] = [
  [1, 'agent', '第一版的引言。', '2026-11-02T10:00:00Z'],
  [2, 'agent', '第二版的引言。', '2026-11-02T12:00:00Z'],
  [
    3,
    'agent',
    '本文将从共享能力、治理方法和效果评估三个方面展开，并给出检查清单。',
    '2026-11-02T14:38:00Z',
  ],
  [
    4,
    '1',
    '本文将从共享能力、治理方法和效果评估三个方面展开，并给出可以直接复制的检查清单。',
    '2026-11-02T15:29:00Z',
  ],
  [
    5,
    '1',
    '本文将从共享能力、治理方法和效果评估三个方面展开。',
    '2026-11-02T15:33:00Z',
  ],
  [6, 'agent', 'Agent 整篇重写的引言。', '2026-11-03T09:14:00Z'],
  [7, 'agent', 'Agent 整篇重写的引言。', '2026-11-03T11:21:00Z'],
  [8, '1', '人工重新改回的引言。', '2026-11-03T15:30:00Z'],
  [9, '1', '人工再次改回的引言。', '2026-11-03T15:42:00Z'],
  [10, '1', '人工最后改好的引言。', '2026-11-03T15:47:00Z'],
];

function t62(): TaskData {
  const versions = INTROS.map(([n, by, intro, at]) =>
    version(n, by, intro, at),
  );
  const event = (v: Artifact) =>
    v.createdBy === 'agent'
      ? {
          at: v.createdAt,
          actor: 'system',
          action: 'runSucceeded',
          artifactId: v.id,
          stageKey: 'write',
        }
      : {
          at: v.createdAt,
          actor: '1',
          action: 'editArticleDraft',
          artifactId: v.id,
          stageKey: 'review',
        };
  return {
    task: {
      id: 62,
      title: '写一篇文章：从 AI Coding 到应用治理',
      brief: '',
      evidence: { no: 62 },
    },
    work: {
      revision: 40,
      stage: 'flow',
      plan: null,
      planVersion: 0,
      step: 0,
      stageIndex: 1,
      humanOwnerId: '1',
      humanOwnerName: 'tianqi',
      playbook: {
        id: 'blog-post',
        name: '写博客文章',
        kind: 'build',
        version: 1,
        next: [],
      },
      flow: {
        id: 'blog-post',
        name: '写博客文章',
        version: 1,
        stages: [
          { key: 'write', name: '修改', kind: 'agent', mode: 'change' },
          { key: 'review', name: '审核', kind: 'review' },
          { key: 'release', name: '发布', kind: 'release' },
        ],
      },
      delivery: {
        kind: 'article',
        targetId: 'cms',
        articleId: null,
        sourceKey: null,
        locales: ['zh'],
      },
      results: [versions[9]],
      history: [
        ...versions.slice(0, 5).map(event),
        {
          at: '2026-11-02T15:34:00Z',
          actor: '1',
          action: 'requestStageChanges',
          stageKey: 'review',
          comment: '图片截图被我随着修改删除了，请重新完善文章的插图。',
        },
        ...versions.slice(5).map(event),
      ],
      operations: [],
    },
    runs: [],
    artifacts: versions,
    reviews: [],
    articleTargets: [
      {
        id: 'cms',
        name: 'NocoBase CMS',
        kind: 'nocobase-api',
        locales: ['zh'],
        status: true,
        capabilities: { concurrency: 'check-before-write', images: true },
      },
    ],
    agent: {
      repo: null,
      online: true,
      agentId: 'codex',
      options: [{ id: 'codex', name: 'codex' }],
    },
  } as unknown as TaskData;
}

// After version 5 was restored over version 10.
function restored(): TaskData {
  const data = t62();
  const v11: Artifact = {
    ...structuredClone(data.artifacts[4]),
    id: 'v11',
    version: 11,
    createdAt: '2026-11-04T02:20:00Z',
    restoredFrom: { artifactId: 'v5', version: 5, byHand: true },
  };
  data.artifacts.push(v11);
  data.work.results = [v11];
  data.work.revision = 41;
  data.work.history.push({
    at: v11.createdAt,
    actor: '1',
    action: 'restoreArticleVersion',
    artifactId: 'v11',
    stageKey: 'review',
  });
  return data;
}

beforeEach(() => {
  setDictionary(null);
  me.canEdit = true;
  action.mockReset();
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
    if (command === 'members')
      return Promise.resolve([{ id: '1', name: 'tianqi' }]);
    if (command === 'advance') return Promise.resolve(restored());
    return Promise.resolve([]);
  });
});
afterEach(() => cleanup());

function mount(data: TaskData) {
  return render(
    <MemoryRouter initialEntries={['/actions/62']}>
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <TaskDetail projectId={1} taskId='62' initial={data} />
        </TaskDraftProvider>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
}
const activity = () => screen.getByRole('region', { name: '动态' });
async function openVersion(
  user: ReturnType<typeof userEvent.setup>,
  line: string,
) {
  const item = within(activity()).getByText(line).closest('li')!;
  await user.click(within(item).getByRole('button', { name: '查看' }));
  return screen.findByRole('dialog', { name: /修改 · 第/ });
}

test('Activity is the version history: versions edited by hand are numbered and open like the Agent’s', async () => {
  const user = userEvent.setup();
  mount(t62());
  await user.click(
    within(activity()).getByRole('button', { name: /显示更早/ }),
  );
  const lines = within(activity())
    .getAllByRole('listitem')
    .map((li) => li.textContent);
  expect(
    lines
      .filter((l) => /第 \d+ 版/.test(l || ''))
      .map((l) => l!.match(/(交付了修改|修改了文章稿，)第 \d+ 版/)?.[0]),
  ).toEqual([
    '交付了修改第 1 版',
    '交付了修改第 2 版',
    '交付了修改第 3 版',
    '修改了文章稿，第 4 版',
    '修改了文章稿，第 5 版',
    '交付了修改第 6 版',
    '交付了修改第 7 版',
    '修改了文章稿，第 8 版',
    '修改了文章稿，第 9 版',
    '修改了文章稿，第 10 版',
  ]);
  for (const li of within(activity()).getAllByRole('listitem'))
    if (/第 \d+ 版/.test(li.textContent || ''))
      expect(within(li).getByRole('button', { name: '查看' })).toBeVisible();
  const dialog = await openVersion(user, '修改了文章稿，第 4 版');
  expect(dialog).toHaveAccessibleName('修改 · 第 4 版');
  expect(dialog).toHaveTextContent(/tianqi 人工修改 · /);
  // The Agent's notes it kept from version 3 are not shown as if they were the person's.
  expect(dialog).not.toHaveTextContent('第 3 版的修改说明');
});

test('a version opens against the one before it, and an earlier one is restored as a new version', async () => {
  const user = userEvent.setup();
  mount(t62());
  await user.click(
    within(activity()).getByRole('button', { name: /显示更早/ }),
  );
  const dialog = await openVersion(user, '修改了文章稿，第 5 版');
  expect(within(dialog).getByRole('heading', { name: TITLE })).toBeVisible();
  // Changes: version 5 against version 4, not against an article that did not exist yet.
  await user.click(within(dialog).getByRole('button', { name: '改动' }));
  expect(dialog).toHaveTextContent('标题 · 未修改');
  expect(dialog).toHaveTextContent('摘要 · 未修改');
  expect(dialog).toHaveTextContent('并给出可以直接复制的检查清单');
  expect(dialog).toHaveTextContent(
    '本文将从共享能力、治理方法和效果评估三个方面展开。',
  );
  expect(dialog).not.toHaveTextContent('第一版的引言');
  expect(dialog).toHaveTextContent(
    '恢复后会生成第 11 版，内容和第 5 版完全一样；现在的第 10 版仍在记录里，随时能再恢复。',
  );
  await user.click(
    within(dialog).getByRole('button', { name: '恢复到这一版' }),
  );
  const call = action.mock.calls.find(([, c]) => c === 'advance');
  expect(call?.[2]?.body).toMatchObject({
    command: 'restoreArticleVersion',
    stageKey: 'review',
    artifactId: 'v5',
    currentId: 'v10',
    revision: 40,
  });
  // Back on the task: version 11 under review, named after version 5, and a line in Activity.
  const card = await screen.findByRole('region', { name: '等你处理' });
  expect(card).toHaveTextContent('第 11 版 · 恢复自第 5 版');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(activity()).toHaveTextContent('恢复到第 5 版，生成第 11 版');
  const again = await openVersion(user, '恢复到第 5 版，生成第 11 版');
  expect(again).toHaveAccessibleName('修改 · 第 11 版');
  expect(again).toHaveTextContent(/tianqi 恢复自第 5 版 · /);
  // Its Changes compare with version 10, the one it replaced.
  await user.click(within(again).getByRole('button', { name: '改动' }));
  expect(again).toHaveTextContent('人工最后改好的引言。');
});

// The review card shows the Agent's notes only above text the Agent wrote, by the version reader's rule (2026-11-04,
// T-62: version 10, edited by hand, read under version 7's notes saying the text was restored unchanged).
const card = () => screen.getByRole('region', { name: '等你处理' });
// The task with `n` under review, without the versions after it, and the Agent's summaries for the reviewer.
function reviewing(data: TaskData, n: number) {
  for (const v of data.artifacts)
    if (v.createdBy === 'agent')
      v.article!.draft.summary = `第 ${v.version} 版的摘要`;
  const shown = data.artifacts.find((v) => v.version === n)!;
  data.artifacts = data.artifacts.filter(
    (v) => v.version <= n || v.restoredFrom,
  );
  data.work.history = data.work.history.filter(
    (e) => !e.artifactId || data.artifacts.some((v) => v.id === e.artifactId),
  );
  data.work.results = [{ ...shown, rejectedAt: undefined }];
  return data;
}

test('the review card shows the Agent’s notes above a version the Agent wrote', async () => {
  const user = userEvent.setup();
  mount(reviewing(t62(), 7));
  expect(card()).toHaveTextContent('第 7 版');
  expect(card()).toHaveTextContent('第 7 版的摘要');
  await user.click(within(card()).getByRole('button', { name: '完整说明' }));
  expect(card()).toHaveTextContent('第 7 版的修改说明');
});

test('the review card shows no Agent notes above a version edited by hand', () => {
  const data = reviewing(t62(), 10);
  // Notes and a summary kept from the Agent's version it replaced.
  data.work.results[0]!.content = '第 7 版的修改说明';
  data.work.results[0]!.article!.draft.summary = '第 7 版的摘要';
  mount(data);
  expect(card()).toHaveTextContent('第 10 版 · 人工修改');
  expect(card()).not.toHaveTextContent('第 7 版的摘要');
  expect(card()).not.toHaveTextContent('第 7 版的修改说明');
  expect(within(card()).queryByRole('button', { name: '完整说明' })).toBeNull();
  expect(within(card()).getByRole('textbox', { name: /^标题/ })).toHaveValue(
    TITLE,
  );
});

test('a version restored from the Agent’s shows that version’s notes; one restored from a hand edit shows none', async () => {
  const user = userEvent.setup();
  // Version 7 restored over version 10: the restore copied version 7's article and notes.
  const data = reviewing(t62(), 10);
  const v7 = data.artifacts[6]!;
  const v11: Artifact = {
    ...structuredClone(v7),
    id: 'v11',
    version: 11,
    createdBy: '1',
    createdAt: '2026-11-04T02:20:00Z',
    rejectedAt: undefined,
    restoredFrom: { artifactId: 'v7', version: 7, byHand: false },
  };
  data.artifacts.push(v11);
  data.work.results = [v11];
  data.work.history.push({
    at: v11.createdAt,
    actor: '1',
    action: 'restoreArticleVersion',
    artifactId: 'v11',
    stageKey: 'review',
  });
  mount(data);
  expect(card()).toHaveTextContent('第 11 版 · 恢复自第 7 版');
  expect(card()).toHaveTextContent('第 7 版的摘要');
  // The version reader follows the same rule.
  const dialog = await openVersion(user, '恢复到第 7 版，生成第 11 版');
  expect(dialog).toHaveTextContent('第 7 版的摘要');
  await user.keyboard('{Escape}');
  cleanup();

  // Version 5, edited by hand, restored: notes kept from version 3 do not show.
  mount(reviewing(restored(), 11));
  expect(card()).toHaveTextContent('第 11 版 · 恢复自第 5 版');
  expect(card()).not.toHaveTextContent('第 3 版的修改说明');
  expect(within(card()).queryByRole('button', { name: '完整说明' })).toBeNull();
});

test('the first version compares with nothing; the version under review has nothing to restore', async () => {
  const user = userEvent.setup();
  mount(t62());
  await user.click(
    within(activity()).getByRole('button', { name: /显示更早/ }),
  );
  const first = await openVersion(user, '交付了修改第 1 版');
  expect(within(first).queryByRole('button', { name: '改动' })).toBeNull();
  expect(first).toHaveTextContent('第 1 版的修改说明');
  expect(
    within(first).getByRole('button', { name: '恢复到这一版' }),
  ).toBeVisible();
  await user.keyboard('{Escape}');
  const current = await openVersion(user, '修改了文章稿，第 10 版');
  expect(
    within(current).queryByRole('button', { name: '恢复到这一版' }),
  ).toBeNull();
});

test.each([
  [
    'approved and publishing',
    (d: TaskData) => {
      d.work.stageIndex = 2;
      d.work.results[0]!.approvedAt = '2026-11-04T01:00:00Z';
      d.work.release = {
        state: 'publishing',
        note: '',
        pages: [],
        article: { artifactId: 'v10', targetId: 'cms', articleId: null },
      };
    },
  ],
  [
    'closed',
    (d: TaskData) => {
      d.work.cancelledAt = '2026-11-04T01:00:00Z';
    },
  ],
  [
    'back with the Agent',
    (d: TaskData) => {
      d.work.stageIndex = 0;
      d.work.results = [
        { ...d.artifacts[9]!, rejectedAt: '2026-11-04T01:00:00Z' },
      ];
    },
  ],
  [
    'not yours to edit',
    () => {
      me.canEdit = false;
    },
  ],
  [
    'from a round already approved',
    (d: TaskData) => {
      d.work.history.push({
        at: '2026-11-03T15:44:00Z',
        actor: '1',
        action: 'approveStage',
        stageKey: 'review',
      });
    },
  ],
])(
  'an earlier version only opens when the article is %s',
  async (_, change) => {
    const user = userEvent.setup();
    const data = t62();
    change(data);
    mount(data);
    await user.click(
      within(activity()).getByRole('button', { name: /显示更早/ }),
    );
    const dialog = await openVersion(user, '修改了文章稿，第 5 版');
    expect(within(dialog).getByRole('heading', { name: TITLE })).toBeVisible();
    expect(
      within(dialog).queryByRole('button', { name: '恢复到这一版' }),
    ).toBeNull();
    expect(dialog).not.toHaveTextContent('恢复后会生成');
  },
);

test('a restore the server refuses closes the reader and says why on the page', async () => {
  const user = userEvent.setup();
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
    if (command === 'members')
      return Promise.resolve([{ id: '1', name: 'tianqi' }]);
    if (command === 'advance')
      return Promise.reject(
        new Error('这一版已经不能恢复了，请刷新页面查看现在的版本。'),
      );
    return Promise.resolve([]);
  });
  mount(t62());
  await user.click(
    within(activity()).getByRole('button', { name: /显示更早/ }),
  );
  const dialog = await openVersion(user, '修改了文章稿，第 5 版');
  await user.click(
    within(dialog).getByRole('button', { name: '恢复到这一版' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '这一版已经不能恢复了，请刷新页面查看现在的版本。',
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region', { name: '等你处理' })).toHaveTextContent(
    '第 10 版 · 人工修改',
  );
});
