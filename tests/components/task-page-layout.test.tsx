import { NavigationGuardProvider } from '@nocobase/app-client';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import { TaskDetail } from '../../client/pages/task-detail';
import ArticleReaderPage from '../../client/pages/task-detail/article-reader';
import type { TaskData } from '../../client/pages/task-execution-types';
import spanish from '../../shared/i18n/es-ES.json';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', async (original) => {
  const module =
    await original<typeof import('../../client/lib/nocoreach-api')>();
  return {
    ...module,
    nocobaseClient: { ...module.nocobaseClient, action, wrapRequests: vi.fn() },
  };
});
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: '1' }, can: () => true }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));

// A page change waiting for its owner, as T-1 on Studio: one PR, a failed run before the one that delivered it.
function pageChange(): TaskData {
  return {
    task: {
      id: 1,
      title: '给 /ja 站首页改写标题与描述',
      brief: '行动目标：恢复 /ja 首页的自然搜索点击量',
      evidence: {
        no: 1,
        insight: { id: 'o-16', no: 16, signalIds: ['gsc:/ja'] },
        context: {
          signals: {
            items: [
              {
                key: 'gsc:/ja',
                source: 'gsc',
                title: '/ja 搜索点击下降 34%',
                facts: ['近 28 天点击 129，前 28 天 194'],
              },
            ],
          },
        },
      },
    },
    work: {
      revision: 3,
      stage: 'flow',
      plan: null,
      planVersion: 0,
      step: 0,
      stageIndex: 1,
      humanOwnerId: '1',
      humanOwnerName: 'Super Admin',
      playbook: {
        id: 'optimize-page',
        name: '优化现有页面',
        kind: 'build',
        version: 1,
        next: [],
      },
      flow: {
        id: 'optimize-page',
        name: '优化现有页面',
        version: 1,
        stages: [
          { key: 'change', name: '修改', kind: 'agent', mode: 'change' },
          { key: 'review', name: '看效果并发布', kind: 'review' },
          { key: 'release', name: '上线', kind: 'release' },
        ],
      },
      results: [
        {
          id: 'artifact-1',
          stepId: 'change',
          planVersion: 0,
          version: 1,
          content: '改动说明',
          createdAt: '2026-10-13T02:14:00Z',
          createdBy: 'agent',
          pr: {
            url: 'https://github.com/nocobase/site/pull/186',
            number: 186,
            branch: 'nocoreach/task-1',
            headSha: '8817982abc',
            files: [
              { path: 'src/pages/ja/index.astro', additions: 9, deletions: 2 },
            ],
            checks: { ok: false, summary: 'yarn build reported 177 errors' },
            release: '日语首页增加独立搜索标题与精简描述。',
            pages: ['https://www.nocobase.com/ja'],
            visibleChanges: [
              {
                page: 'https://www.nocobase.com/ja',
                label: '搜索标题',
                before: '',
                after: 'オープンソース AI ノーコード',
              },
            ],
          },
        },
      ],
      history: [
        { at: '2026-10-12T03:55:00Z', actor: '1', action: 'startTask' },
        {
          at: '2026-10-12T03:56:00Z',
          actor: 'system',
          action: 'runFailed',
          runId: 'run-1',
          note: 'agent_failed',
        },
        {
          at: '2026-10-13T02:14:00Z',
          actor: 'system',
          action: 'runSucceeded',
          runId: 'run-2',
          artifactId: 'artifact-1',
        },
      ],
    },
    runs: [],
    artifacts: [],
    reviews: [],
    agent: {
      repo: { repo: 'nocobase/site' },
      online: true,
      agentId: 'codex',
      options: [{ id: 'codex', name: 'codex' }],
    },
  } as unknown as TaskData;
}
beforeEach(() => {
  setDictionary(null);
  action.mockReset();
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
    if (command === 'members')
      return Promise.resolve([{ id: '1', name: 'Super Admin' }]);
    return Promise.resolve([]);
  });
});
afterEach(() => cleanup());
function mount(data = pageChange(), entry = '/actions/1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <TaskDetail projectId={1} taskId='1' initial={data} />
        </TaskDraftProvider>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
}

test('unknown activity actors use a member label instead of claiming the current user acted', async () => {
  setDictionary(spanish, 'es-ES');
  const data = pageChange();
  data.work.history = [
    {
      at: '2026-10-13T02:14:00Z',
      actor: 'missing-member',
      action: 'linkContent',
    },
    { at: '2026-10-13T02:15:00Z', actor: '1', action: 'linkContent' },
  ];
  mount(data);
  const activity = screen.getByRole('region', { name: 'Actividad' });
  expect(
    await within(activity).findByText('Miembro', { selector: '[data-actor]' }),
  ).toBeVisible();
  expect(
    await within(activity).findByText('Super Admin', {
      selector: '[data-actor]',
    }),
  ).toBeVisible();
  expect(
    within(activity).queryByText('Tú', { selector: '[data-actor]' }),
  ).toBeNull();
});

test('a page change is reviewed as what readers see, with code kept in Technical details', async () => {
  const user = userEvent.setup();
  mount();
  const card = screen.getByRole('region', { name: '等你处理' });
  expect(
    within(card).getByRole('heading', { name: '改动已完成，请检查后发布' }),
  ).toBeVisible();
  expect(within(card).getByText('オープンソース AI ノーコード')).toBeVisible();
  expect(within(card).getByText('（原来没有）')).toBeVisible();
  expect(
    within(card).getByText('自动检查有提醒，发布前请开发人员确认'),
  ).toBeVisible();
  // No pull request, branch, file path or raw check output on the page itself.
  expect(document.body).not.toHaveTextContent('#186');
  expect(document.body).not.toHaveTextContent('src/pages/ja/index.astro');
  expect(document.body).not.toHaveTextContent('177 errors');
  expect(document.body).not.toHaveTextContent('Runner');
  await user.click(within(card).getByRole('button', { name: '技术细节' }));
  const dialog = await screen.findByRole('dialog', { name: '技术细节' });
  expect(dialog).toHaveTextContent('#186');
  expect(dialog).toHaveTextContent('src/pages/ja/index.astro');
  expect(dialog).toHaveTextContent('yarn build reported 177 errors');
});

// 2026-10-24 user request: "Agent · Version 2" named the Agent that Properties already shows.
test('the review card names the version, and says so when a person made it', () => {
  const view = mount();
  const card = screen.getByRole('region', { name: '等你处理' });
  expect(card).toHaveTextContent('第 1 版');
  expect(card).not.toHaveTextContent('Agent · 第');
  view.unmount();
  const edited = pageChange();
  (edited.work.results[0] as { createdBy?: string }).createdBy = '1';
  mount(edited);
  expect(screen.getByRole('region', { name: '等你处理' })).toHaveTextContent(
    '第 1 版 · 人工修改',
  );
});

test('the header says why the task exists and opens the evidence', async () => {
  const user = userEvent.setup();
  mount();
  expect(screen.getByText(/\/ja 搜索点击下降 34%/)).toBeVisible();
  expect(screen.getByRole('list', { name: '进度' })).toHaveTextContent(
    '看效果并发布',
  );
  await user.click(screen.getByRole('button', { name: '查看依据' }));
  const dialog = await screen.findByRole('dialog', { name: '依据' });
  expect(dialog).toHaveTextContent('近 28 天点击 129，前 28 天 194');
  expect(dialog).toHaveTextContent('行动目标：恢复 /ja 首页的自然搜索点击量');
});

// 2026-10-24 user request: the header's steps are tags again, as before #241, and the highlighted step says where the
// task stands, with no "Now:" text after them.
test('the header shows the steps as tags, done ones ticked and the current one highlighted', () => {
  mount();
  const steps = screen.getByRole('list', { name: '进度' });
  const [first] = within(steps).getAllByRole('listitem');
  expect(first).toHaveAttribute('data-state', 'done');
  expect(first.querySelector('[data-slot="tag"]')).toHaveAttribute(
    'data-tone',
    'green',
  );
  const current = steps.querySelector('[aria-current="step"]');
  expect(current).toHaveTextContent('看效果并发布');
  expect(current?.querySelector('[data-slot="tag"]')).toHaveAttribute(
    'data-tone',
    'violet',
  );
  expect(document.body).not.toHaveTextContent('现在：');
});

test('activity lists deliveries and leaves failed runs to Technical details', async () => {
  const user = userEvent.setup();
  mount();
  const activity = screen.getByRole('region', { name: '动态' });
  expect(activity).toHaveTextContent('交付了修改第 1 版');
  expect(activity).not.toHaveTextContent('agent_failed');
  expect(activity).not.toHaveTextContent('没有完成');
  await user.click(within(activity).getByRole('button', { name: '查看' }));
  const reader = await screen.findByRole('dialog', { name: /修改/ });
  expect(reader).toHaveTextContent('オープンソース AI ノーコード');
});

test('an older ?run= link opens Technical details on its runs', async () => {
  mount(pageChange(), '/actions/1?run=run-2');
  const dialog = await screen.findByRole('dialog', { name: '技术细节' });
  expect(within(dialog).getByRole('tab', { name: '执行记录' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

// T-34 on Studio (2026-10-22): an article whose publish to the CMS stopped; the card stays in plain words.
function failedPublish(): TaskData {
  const data = pageChange();
  const [artifact] = data.work.results as NonNullable<
    TaskData['work']['results'][number]
  >[];
  data.work.stageIndex = 2;
  data.work.results = [
    {
      ...artifact,
      pr: undefined,
      approvedAt: '2026-10-22T07:41:00Z',
      article: {
        targetId: 'cms',
        articleId: '7',
        baseKey: null,
        baseVersion: 'v1',
        draft: { locales: { en: { title: 'Workflow automation tools' } } },
        changes: ['en.title'],
      },
    },
  ] as TaskData['work']['results'];
  data.work.release = {
    state: 'publish_failed',
    note: '',
    pages: [],
    article: {
      artifactId: 'artifact-1',
      targetId: 'cms',
      articleId: '7',
      slug: 'workflow-automation-tools',
      error: 'unavailable',
      errorStep: 'downstream',
      errorDetail: 'github:429',
      errorAt: '2026-10-22T07:42:00Z',
    },
  };
  data.articleTargets = [
    {
      id: 'cms',
      name: 'NocoBase CMS',
      kind: 'nocobase-api',
      locales: ['en'],
      capabilities: { concurrency: 'check-before-write' },
    },
  ] as TaskData['articleTargets'];
  return data;
}

test('a failed publish keeps its plain reason on the card and its step and detail in Technical details', async () => {
  const user = userEvent.setup();
  mount(failedPublish());
  const card = screen.getByRole('region', { name: '等你处理' });
  expect(
    within(card).getByRole('heading', { name: '发布没有完成' }),
  ).toBeVisible();
  expect(
    within(card).getByText('暂时无法连接目标系统，请稍后再试。'),
  ).toBeVisible();
  expect(document.body).not.toHaveTextContent('github:429');
  expect(document.body).not.toHaveTextContent('检查网站仓库');
  await user.click(within(card).getByRole('button', { name: '技术细节' }));
  const dialog = await screen.findByRole('dialog', { name: '技术细节' });
  expect(within(dialog).getByRole('tab', { name: '代码改动' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const section = within(dialog)
    .getByRole('heading', { name: '发布到 NocoBase CMS 没有完成' })
    .closest('section')!;
  expect(section).toHaveTextContent('停在检查网站仓库');
  expect(section).toHaveTextContent('错误代码unavailable');
  expect(section).toHaveTextContent('github:429');
  expect(dialog).not.toHaveTextContent('这个任务没有代码改动。');
});

// T-32 on Studio (2026-10-21): an opportunity about one blog post; the article is found from its page, not picked.
function blogPageTask(): TaskData {
  const page = 'https://www.nocobase.com/en/blog/workflow-automation-tools';
  return {
    task: {
      id: 32,
      title: '给工作流自动化博客页改标题',
      brief: '行动目标：把曝光转成点击',
      evidence: {
        no: 32,
        insight: { id: 'o-40', no: 40, target: page, signalIds: ['gsc:wf'] },
        context: {
          signals: {
            items: [
              {
                key: 'gsc:wf',
                source: 'gsc',
                title: '/en/blog/workflow-automation-tools 平均排名 19.8',
                facts: ['近 28 天曝光 5,790，点击 0'],
                url: page,
              },
            ],
          },
        },
      },
    },
    work: {
      revision: 4,
      stage: 'plan',
      plan: null,
      planVersion: 0,
      step: 0,
      results: [],
      history: [],
      humanOwnerId: '1',
      humanOwnerName: 'Super Admin',
    },
    runs: [],
    artifacts: [],
    reviews: [],
    playbookDefault: 'optimize-page',
    articleTargets: [
      {
        id: 'cms',
        name: 'NocoBase CMS',
        kind: 'nocobase-api',
        locales: ['en'],
        capabilities: { concurrency: 'check-before-write' },
        default: true,
        pages: { en: 'https://www.nocobase.com/en/blog/{slug}' },
      },
    ],
    agent: {
      repo: { repo: 'nocobase/website', baseBranch: 'main' },
      online: true,
      agentId: 'codex',
      options: [{ id: 'codex', name: 'codex' }],
    },
  } as unknown as TaskData;
}

test('the start card finds the article from the task page and links it as the task starts', async () => {
  const data = blogPageTask();
  const article = {
    targetId: 'cms',
    articleId: '501',
    slug: 'workflow-automation-tools',
    title: 'Top Workflow Automation Tools',
    url: 'https://www.nocobase.com/en/blog/workflow-automation-tools',
  };
  const commands: Record<string, unknown>[] = [];
  action.mockImplementation(
    (
      resource: string,
      command: string,
      init?: { body?: Record<string, unknown> },
    ) => {
      if (resource === 'nrPlaybooks')
        return Promise.resolve({
          playbooks: [
            {
              id: 'optimize-page',
              name: '优化现有页面',
              kind: 'build',
              category: 'optimize',
              steps: [{ key: 'change', name: '修改', kind: 'change' }],
            },
          ],
        });
      if (resource === 'nrArticles' && command === 'match')
        return Promise.resolve({ article, unchecked: false });
      if (resource === 'nrTaskWork' && command === 'advance') {
        commands.push(init!.body!);
        const revision = Number(init!.body!.revision) + 1;
        return Promise.resolve({
          ...data,
          work: { ...data.work, revision },
        });
      }
      return Promise.resolve([]);
    },
  );
  mount(data, '/actions/32');
  expect(
    await screen.findByRole('link', { name: 'Top Workflow Automation Tools' }),
  ).toHaveAttribute('href', article.url);
  expect(screen.getByText('要修改的文章')).toBeTruthy();
  expect(screen.queryByLabelText('发布到')).toBeNull();
  expect(
    action.mock.calls.find(([r, c]) => r === 'nrArticles' && c === 'match')?.[2]
      .body.urls,
  ).toEqual([article.url]);
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: '确定开始执行' }));
  await vi.waitFor(() => expect(commands).toHaveLength(2));
  expect(commands[0]).toMatchObject({
    command: 'linkArticle',
    targetId: 'cms',
    articleId: '501',
    revision: 4,
  });
  expect(commands[1]).toMatchObject({
    command: 'startTask',
    playbookId: 'optimize-page',
    revision: 5,
  });
  expect(commands[1].delivery).toBeUndefined();
});

// T-33 on Studio (2026-10-21): the article is saved on the task; its page is built from the target's pattern.
function savedArticleTask(): TaskData {
  const data = blogPageTask();
  return {
    ...data,
    work: {
      ...data.work,
      article: {
        targetId: 'cms',
        articleId: '501',
        slug: 'workflow-automation-tools',
        title: '5 Best Tools for Building Workflow Automation',
        sourceKey: null,
      },
    },
  } as unknown as TaskData;
}
const OPTIMIZE = {
  id: 'optimize-page',
  name: '优化现有页面',
  kind: 'build',
  category: 'optimize',
  description: '改进已有页面的标题、描述、结构和内容。',
  steps: [
    {
      key: 'change',
      name: '修改',
      kind: 'change',
      instruction: '读取当前页面，改标题和描述。',
    },
    {
      key: 'review',
      name: '看效果并发布',
      kind: 'review',
      checklist: [{ key: 'goal', label: '改动符合目标', required: true }],
    },
  ],
};

test('View steps opens the playbook over the task page, with a way to the Playbooks page', async () => {
  const user = userEvent.setup();
  action.mockImplementation((resource: string) =>
    Promise.resolve(
      resource === 'nrPlaybooks' ? { revision: 1, playbooks: [OPTIMIZE] } : [],
    ),
  );
  mount(savedArticleTask(), '/actions/33');
  await user.click(await screen.findByRole('button', { name: '查看步骤' }));
  const drawer = await screen.findByRole('dialog', { name: '优化现有页面' });
  const steps = within(drawer).getByRole('list', { name: '步骤' });
  expect(steps).toHaveTextContent('Agent 修改');
  expect(steps).toHaveTextContent('读取当前页面，改标题和描述。');
  expect(steps).toHaveTextContent('确认：改动符合目标');
  expect(
    within(drawer).getByRole('link', { name: '在做法页查看或编辑' }),
  ).toHaveAttribute('href', '/playbooks?id=optimize-page');
  // Closing it leaves the start card as it was.
  await user.keyboard('{Escape}');
  await vi.waitFor(() =>
    expect(screen.queryByRole('dialog', { name: '优化现有页面' })).toBeNull(),
  );
  expect(screen.getByRole('button', { name: '确定开始执行' })).toBeTruthy();
});

test('Change opens a dialog and the card keeps its one-line summary', async () => {
  const user = userEvent.setup();
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks')
      return Promise.resolve({ revision: 1, playbooks: [OPTIMIZE] });
    if (resource === 'nrArticles' && command === 'search')
      return Promise.resolve([]);
    return Promise.resolve([]);
  });
  mount(savedArticleTask(), '/actions/33');
  const title = '5 Best Tools for Building Workflow Automation';
  // In the header and on the start card, both to the public page.
  await vi.waitFor(() =>
    expect(
      screen
        .getAllByRole('link', { name: new RegExp(title) })
        .map((l) => l.getAttribute('href')),
    ).toEqual([
      'https://www.nocobase.com/en/blog/workflow-automation-tools',
      'https://www.nocobase.com/en/blog/workflow-automation-tools',
    ]),
  );

  const card = screen.getByRole('region', { name: '等你处理' });
  await user.click(within(card).getByRole('button', { name: '更改' }));
  const dialog = await screen.findByRole('dialog', { name: '选择文章' });
  expect(within(dialog).getByLabelText('发布到')).toHaveValue('cms');
  expect(within(dialog).getByRole('radio', { name: '已有文章' })).toBeChecked();
  expect(dialog).toHaveTextContent(
    `已选：${title}（workflow-automation-tools）`,
  );
  // The card itself never opens the old two-column editor.
  expect(within(card).queryByLabelText('发布到')).toBeNull();
  await user.click(within(dialog).getByRole('radio', { name: '新文章' }));
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(screen.queryByRole('dialog', { name: '选择文章' })).toBeNull();
  expect(within(card).getByText('发布到 NocoBase CMS')).toBeTruthy();
});

test('the properties column lists owner, Agent, playbook, source, article, page and start, with the article in full', async () => {
  const data = pageChange();
  data.work.article = {
    targetId: 'cms',
    articleId: '7',
    slug: 'top-open-source-no-code-tools',
    title: 'Top 11 Open Source No-Code Tools in 2026',
    sourceKey: null,
  };
  data.work.page = { url: 'https://www.nocobase.com/ja', title: '' };
  data.articleTargets = [
    {
      id: 'cms',
      name: 'NocoBase CMS',
      kind: 'nocobase-api',
      locales: ['en'],
      capabilities: { concurrency: 'check-before-write' },
      pages: { en: 'https://www.nocobase.com/en/blog/{slug}' },
    },
  ];
  mount(data);
  const column = screen.getByRole('complementary', { name: '属性' });
  const value = (label: string) =>
    within(column).getByText(label, { selector: 'dt' }).nextElementSibling!;
  expect(value('负责人')).toHaveTextContent('Super Admin');
  expect(value('Agent')).toHaveTextContent('codex');
  expect(value('做法')).toHaveTextContent('优化现有页面');
  // Found by the AI from opportunity O-16, kept apart from the owner.
  expect(value('来源')).toHaveTextContent(/Found by AI\s*·\s*O-16/);
  expect(value('来源')).toHaveTextContent('每日分析');
  expect(
    within(value('来源')).getByRole('button', { name: 'O-16' }),
  ).toBeVisible();
  expect(
    within(value('文章')).getByRole('link', {
      name: 'Top 11 Open Source No-Code Tools in 2026',
    }),
  ).toHaveAttribute(
    'href',
    'https://www.nocobase.com/en/blog/top-open-source-no-code-tools',
  );
  expect(within(value('关联页面')).getByRole('link')).toHaveAttribute(
    'href',
    'https://www.nocobase.com/ja',
  );
  expect(value('开始于')).toHaveTextContent('10');
  // The header keeps the title and its menu only; the steps no longer repeat the playbook's name.
  const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
  expect(header).not.toHaveTextContent('Super Admin');
  expect(screen.getByRole('list', { name: '进度' })).not.toHaveTextContent(
    '优化现有页面',
  );
});

test('Performance lists each page: the latest 28 days before going live, then day 7 or 28 before and after', async () => {
  const user = userEvent.setup();
  const pages = [
    'https://www.nocobase.com/en/blog/ai-agent-platforms',
    'https://www.nocobase.com/en/blog/no-code-ai-tools',
    'https://www.nocobase.com/en/blog/open-source-crm',
    'https://www.nocobase.com/en/blog/workflow-tools',
  ];
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
    if (resource === 'nrTaskWork' && command === 'numbers')
      return Promise.resolve({
        range: { start: '2026-09-22', end: '2026-10-19' },
        live: false,
        gscDays: 28,
        ga4Days: 0,
        pages: pages.map((page, i) => ({
          page,
          clicks: 400 - i * 100,
          position: 32 - i * 5,
        })),
      });
    return Promise.resolve([]);
  });
  const { unmount } = mount();
  let block = await screen.findByRole('region', { name: '数据表现' });
  expect(
    await within(block).findByText('近 28 天 · 搜索点击 · 平均排名'),
  ).toBeVisible();
  expect(
    within(block).getByRole('link', { name: '/en/blog/ai-agent-platforms' }),
  ).toHaveAttribute('href', pages[0]);
  expect(block).toHaveTextContent('400 · 第 32 位');
  // Three pages, then the rest on request.
  expect(within(block).queryByText('/en/blog/workflow-tools')).toBeNull();
  await user.click(
    within(block).getByRole('button', { name: '还有 1 个页面' }),
  );
  expect(within(block).getByText('/en/blog/workflow-tools')).toBeVisible();
  // When the comparison comes is the title's ⓘ.
  expect(block).not.toHaveTextContent(
    '上线后在第 7 天、第 28 天和这些数字对比。',
  );
  await user.click(within(block).getByRole('button', { name: '说明' }));
  expect(
    await screen.findByText('上线后在第 7 天、第 28 天和这些数字对比。'),
  ).toBeVisible();
  unmount();
  // Live with day 7: each page before and after, then all pages together; day 28 waits.
  const data = pageChange();
  data.work.observeFrom = '2026-10-01T08:00:00Z';
  data.work.observation = {
    results: [
      {
        day: 7,
        baseline: { start: '2026-09-24', end: '2026-09-30' },
        after: { start: '2026-10-02', end: '2026-10-08' },
        pages: pages.slice(0, 2),
        byPage: [
          { page: pages[0], clicks: [96, 131], position: [32, 20] },
          { page: pages[1], clicks: [71, 74], position: [18, 17] },
        ],
        gsc: {
          clicks: [167, 205],
          impressions: [0, 0],
          ctr: [0, 0],
          position: [0, 0],
        },
        primary: 'clicks',
        change: 0.228,
        conclusion: 'up',
        notes: [],
        computedAt: '2026-10-12T00:00:00Z',
      },
    ],
  } as unknown as TaskData['work']['observation'];
  mount(data);
  block = screen.getByRole('region', { name: '数据表现' });
  expect(
    within(block).getByText('搜索点击 · 上线前 7 天 → 上线后 7 天'),
  ).toBeVisible();
  const rows = within(block).getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent(
    '/en/blog/ai-agent-platforms96 → 131 ↑ 36%',
  );
  expect(rows[1]).toHaveTextContent('71 → 74 ↑ 4.2%');
  expect(block).toHaveTextContent('合计 2 个页面167 → 205 ↑ 23%');
  expect(
    within(block).getByRole('button', { name: '第 28 天' }),
  ).toBeDisabled();
  expect(
    within(block).getByRole('link', { name: '在成果页查看完整对比' }),
  ).toHaveAttribute('href', '/results/1?day=7');
  expect(action.mock.calls.some(([, c]) => c === 'numbers')).toBe(true);
});

// T-34 after going live (2026-10-22): the card names what changed and opens the change itself.
function liveArticle(): TaskData {
  const data = failedPublish();
  const [artifact] = data.work.results as NonNullable<
    TaskData['work']['results'][number]
  >[];
  data.work.stage = 'done';
  data.work.results = [
    {
      ...artifact,
      content: 'Added the 2026 picks and updated the star counts.',
      article: {
        targetId: 'cms',
        articleId: '7',
        baseKey: 'base-1',
        baseVersion: 'v1',
        draft: {
          locales: {
            en: {
              title: 'Top 12 Open Source No-Code AI Tools (2026)',
              description: 'Updated for 2026 with star counts.',
            },
          },
        },
        changes: ['en.description', 'en.title'],
      },
    },
  ] as TaskData['work']['results'];
  data.articleBases = {
    'base-1': {
      id: '7',
      slug: 'top-11-github-open-source-no-code-ai-tools',
      version: 'v1',
      readAt: '2026-10-22T02:51:00Z',
      locales: {
        en: {
          title:
            'Top 11 Open Source No-Code AI Tools with the Most GitHub Stars',
          description: 'The most starred tools.',
          body: 'Body',
        },
      },
    },
  };
  data.work.release = {
    state: 'live',
    note: 'Added the 2026 picks',
    pages: [
      'https://www.nocobase.com/en/blog/top-11-github-open-source-no-code-ai-tools',
    ],
    liveAt: '2026-10-22T10:03:00Z',
    article: {
      artifactId: 'artifact-1',
      targetId: 'cms',
      articleId: '7',
      slug: 'top-11-github-open-source-no-code-ai-tools',
      published: {
        articleId: '7',
        slug: 'top-11-github-open-source-no-code-ai-tools',
        version: 'v2',
        written: ['en.description', 'en.title'],
        at: '2026-10-22T09:43:00Z',
      },
    },
  };
  return data;
}

// 2026-10-24 user report: an article's review card asked for release notes, which no publishing target receives.
test('an article review has no release notes to edit, and the live card none to show', async () => {
  const user = userEvent.setup();
  const data = liveArticle();
  const [artifact] = data.work.results as NonNullable<
    TaskData['work']['results'][number]
  >[];
  data.work.stage = 'flow';
  data.work.stageIndex = 1;
  delete data.work.release;
  delete (artifact as { approvedAt?: string }).approvedAt;
  const view = mount(data);
  const card = screen.getByRole('region', { name: '等你处理' });
  expect(
    within(card).getByText('Top 12 Open Source No-Code AI Tools (2026)'),
  ).toBeVisible();
  expect(within(card).queryByRole('button', { name: /发布说明/ })).toBeNull();
  action.mockImplementation((resource: string, command: string) =>
    Promise.resolve(
      command === 'advance'
        ? data
        : resource === 'nrPlaybooks'
          ? { playbooks: [] }
          : [],
    ),
  );
  await user.click(within(card).getByRole('button', { name: '通过并发布' }));
  const approve = action.mock.calls.find(([, c]) => c === 'advance');
  expect(approve?.[2]?.body).toMatchObject({ command: 'approveStage' });
  expect(approve?.[2]?.body).not.toHaveProperty('release');
  view.unmount();
  mount(liveArticle());
  expect(
    within(screen.getByRole('region', { name: '已完成' })).queryByRole(
      'button',
      {
        name: /发布说明/,
      },
    ),
  ).toBeNull();
});

// The task with its child route, as nocoreach-routes.ts declares it, and the address the router is at.
function Where() {
  const l = useLocation();
  return <output data-testid='where'>{l.pathname + l.search}</output>;
}
function mountRoutes(data: TaskData, entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <Routes>
            <Route
              path='/actions/:taskId'
              element={<TaskDetail projectId={1} taskId='1' initial={data} />}
            >
              <Route path='article' element={<ArticleReaderPage />} />
            </Route>
          </Routes>
          <Where />
        </TaskDraftProvider>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
}
// The reading page: the page that holds Back to task (the task page stays mounted, covered, underneath).
const readerPage = () =>
  screen.getByRole('button', { name: '返回任务' }).closest('section')!;
function reviewArticle(): TaskData {
  const data = liveArticle();
  const [artifact] = data.work.results as NonNullable<
    TaskData['work']['results'][number]
  >[];
  data.work.stage = 'flow';
  data.work.stageIndex = 1;
  delete data.work.release;
  delete (artifact as { approvedAt?: string }).approvedAt;
  return data;
}

// 2026-10-24 user request: the article on a page of its own, to read without the task around it.
test('Read full screen opens the article on its own page, and Esc goes back to the task', async () => {
  const user = userEvent.setup();
  mountRoutes(reviewArticle(), '/actions/1');
  const card = screen.getByRole('region', { name: '等你处理' });
  await user.click(within(card).getByLabelText('全屏阅读'));
  expect(screen.getByTestId('where')).toHaveTextContent(
    '/actions/1/article?lang=en&view=changes',
  );
  const reader = readerPage();
  expect(
    within(reader).getByRole('button', { name: '通过并发布' }),
  ).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.getByTestId('where')).toHaveTextContent(/^\/actions\/1$/);
});

test('the reading page opens from its address, follows its language and view, and approves', async () => {
  const user = userEvent.setup();
  const data = reviewArticle();
  action.mockImplementation((resource: string, command: string) =>
    Promise.resolve(
      command === 'advance'
        ? data
        : resource === 'nrPlaybooks'
          ? { playbooks: [] }
          : [],
    ),
  );
  mountRoutes(data, '/actions/1/article?lang=en&view=preview');
  const reader = readerPage();
  expect(
    within(reader).getByRole('heading', {
      name: 'Top 12 Open Source No-Code AI Tools (2026)',
    }),
  ).toBeVisible();
  expect(within(reader).getByRole('button', { name: '预览' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await user.click(within(reader).getByRole('button', { name: '改动' }));
  expect(screen.getByTestId('where')).toHaveTextContent('view=changes');
  await user.click(within(reader).getByRole('button', { name: '通过并发布' }));
  const approve = action.mock.calls.find(([, c]) => c === 'advance');
  expect(approve?.[2]?.body).toMatchObject({
    command: 'approveStage',
    artifactId: 'artifact-1',
  });
  await waitFor(() =>
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/actions\/1$/),
  );
});

test('a live article names what changed on its card and shows each field before and after', async () => {
  const user = userEvent.setup();
  mount(liveArticle());
  const card = screen.getByRole('region', { name: '已完成' });
  expect(card).toHaveTextContent('改了 2 处：英语 · 摘要、英语 · 标题');
  // The comparison itself stays out of the card until asked for.
  expect(card).not.toHaveTextContent('The most starred tools.');
  await user.click(within(card).getByRole('button', { name: /查看改动/ }));
  const dialog = await screen.findByRole('dialog', { name: '改了什么' });
  expect(dialog).toHaveTextContent('第 1 版');
  expect(dialog).toHaveTextContent('审核通过');
  expect(dialog).toHaveTextContent(
    'Top 11 Open Source No-Code AI Tools with the Most GitHub Stars',
  );
  expect(dialog).toHaveTextContent(
    'Top 12 Open Source No-Code AI Tools (2026)',
  );
  expect(dialog).toHaveTextContent('Updated for 2026 with star counts.');
  await user.keyboard('{Escape}');
  // The activity's View of the delivered version shows the Agent's notes and the same comparison.
  const activity = screen.getByRole('region', { name: '动态' });
  await user.click(within(activity).getByRole('button', { name: '查看' }));
  const reader = await screen.findByRole('dialog', { name: /修改/ });
  expect(reader).toHaveTextContent(
    'Added the 2026 picks and updated the star counts.',
  );
  expect(reader).toHaveTextContent(
    'Top 12 Open Source No-Code AI Tools (2026)',
  );
});

// 2026-10-24 user report: a new article is not a set of changed fields.
test('a new article that went live is named as one and opens as the article', async () => {
  const user = userEvent.setup();
  const data = liveArticle();
  const [artifact] = data.work.results as NonNullable<
    TaskData['work']['results'][number]
  >[];
  artifact.article = {
    ...artifact.article!,
    articleId: null,
    baseKey: null,
    baseVersion: null,
    draft: {
      slug: 'new-post',
      locales: { en: { title: 'New post', description: 'D', body: 'Body' } },
    },
    changes: ['slug', 'en.title', 'en.description', 'en.body'],
  } as typeof artifact.article;
  mount(data);
  const card = screen.getByRole('region', { name: '已完成' });
  expect(card).toHaveTextContent('新文章');
  expect(card).not.toHaveTextContent('改了');
  await user.click(within(card).getByRole('button', { name: /查看文章/ }));
  const dialog = await screen.findByRole('dialog', { name: '文章' });
  expect(
    within(dialog).getByRole('heading', { name: 'New post' }),
  ).toBeVisible();
  expect(within(dialog).queryByRole('button', { name: '改动' })).toBeNull();
});

test('a live page change names what readers see differently and opens it', async () => {
  const user = userEvent.setup();
  const data = pageChange();
  data.work.stage = 'done';
  data.work.stageIndex = 2;
  data.work.results[0]!.approvedAt = '2026-10-13T03:00:00Z';
  data.work.release = {
    state: 'live',
    note: '日语首页增加独立搜索标题与精简描述。',
    pages: ['https://www.nocobase.com/ja'],
    pr: {
      number: 186,
      url: 'https://github.com/nocobase/site/pull/186',
      headSha: '8817982abc',
    },
    mergedAt: '2026-10-13T03:05:00Z',
    liveAt: '2026-10-13T04:00:00Z',
  };
  mount(data);
  const card = screen.getByRole('region', { name: '已完成' });
  expect(card).toHaveTextContent('改了 1 处：搜索标题');
  await user.click(within(card).getByRole('button', { name: /查看改动/ }));
  const dialog = await screen.findByRole('dialog', { name: '改了什么' });
  expect(dialog).toHaveTextContent('オープンソース AI ノーコード');
});
