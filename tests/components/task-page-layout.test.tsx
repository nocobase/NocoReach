import { NavigationGuardProvider } from '@nocobase/app-client';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import { TaskDetail } from '../../client/pages/task-detail';
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
    await within(activity).findByText('Miembro', { selector: 'b' }),
  ).toBeVisible();
  expect(
    await within(activity).findByText('Super Admin', { selector: 'b' }),
  ).toBeVisible();
  expect(within(activity).queryByText('Tú', { selector: 'b' })).toBeNull();
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
  expect(
    within(value('来自')).getByRole('button', { name: 'O-16' }),
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
