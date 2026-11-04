import { formatDateTime } from '../../client/lib/format';
import { NavigationGuardProvider } from '@nocobase/app-client';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import {
  TaskDraftNavigationGuard,
  TaskDraftProvider,
} from '../../client/pages/task-detail/drafts';
import { TaskDetail } from '../../client/pages/task-detail';
import ArticleReaderPage from '../../client/pages/task-detail/article-reader';
import type { TaskData } from '../../client/pages/task-execution-types';
import spanish from '../../shared/i18n/es-ES.json';
import russian from '../../shared/i18n/ru-RU.json';

const { action, articleEdit } = vi.hoisted(() => ({
  action: vi.fn(),
  articleEdit: vi.fn(),
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => {
  const module =
    await original<typeof import('../../client/lib/nocoreach-api')>();
  return {
    ...module,
    nocobaseClient: {
      ...module.nocobaseClient,
      // The article's autosave and edit lease (article-edit-session.ts) answer on their own, so each test's `action`
      // stays about the task.
      action: (resource: string, command: string, options?: object) =>
        command === 'articleEdit'
          ? articleEdit(options)
          : action(resource, command, options),
      wrapRequests: vi.fn(),
    },
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
  articleEdit.mockReset();
  articleEdit.mockResolvedValue({ lease: null, mine: true, draft: null });
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

test('Russian activity keeps named actors separate from gender-neutral event states', async () => {
  setDictionary(russian, 'ru-RU');
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
    if (command === 'members')
      return Promise.resolve([
        { id: '1', name: 'Ирина' },
        { id: '2', name: 'Иван' },
      ]);
    return Promise.resolve([]);
  });
  const data = pageChange();
  data.work.history = [
    { at: '2026-10-13T02:10:00Z', actor: '1', action: 'startTask' },
    { at: '2026-10-13T02:11:00Z', actor: '2', action: 'editStageOutput' },
    { at: '2026-10-13T02:12:00Z', actor: 'system', action: 'merged' },
    {
      at: '2026-10-13T02:14:00Z',
      actor: 'system',
      action: 'runSucceeded',
      artifactId: 'artifact-1',
    },
  ];
  mount(data);
  const activity = screen.getByRole('region', {
    name: russian['common.activity'],
  });
  const irina = await within(activity).findByText('Ирина', {
    selector: '[data-actor]',
  });
  const ivan = await within(activity).findByText('Иван', {
    selector: '[data-actor]',
  });
  expect(irina.closest('p')).toHaveTextContent('Ирина — задача запущена');
  expect(ivan.closest('p')).toHaveTextContent(
    'Иван — контент отредактирован напрямую',
  );
  const agentRows = within(activity)
    .getAllByText(russian['common.localAgent'], { selector: '[data-actor]' })
    .map((actor) => actor.closest('p'));
  expect(agentRows).toHaveLength(2);
  for (const row of agentRows) {
    expect(row).toHaveTextContent(`${russian['common.localAgent']} — `);
  }
  expect(agentRows[0]).toHaveTextContent(russian['taskDetail.eventPublished']);
  expect(
    within(agentRows[1]!).getByRole('button', { name: russian['common.view'] }),
  ).toBeVisible();
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
      if (resource === 'nrTaskWork' && command === 'pagePlaces')
        return Promise.resolve({
          article,
          unchecked: false,
          pages: [{ url: article.url, article }],
        });
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
  // 2026-10-29: the pages to change, and one line for where they are changed.
  expect(screen.getByText('要改的页面')).toBeTruthy();
  expect(screen.getByText('博客文章 · 在 NocoBase CMS 里改')).toBeTruthy();
  expect(screen.queryByLabelText('发布到')).toBeNull();
  expect(
    action.mock.calls.find(
      ([r, c]) => r === 'nrTaskWork' && c === 'pagePlaces',
    )?.[2].body,
  ).toMatchObject({ taskId: '1' });
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
  // No separate note at the start (2026-10-24): instructions go in the activity's message box.
  expect(commands[1]).not.toHaveProperty('note');
});

// Site pages with one website repository, then with two (2026-10-30 user decision, merging #322 and #324): the pages
// to change are always listed; with one repository a line says where they are changed, with more than one place the
// Changes go to select replaces that line.
function sitePagesTask(repos: { id: string; urls: string[] }[]): TaskData {
  const pages = [
    'https://www.nocobase.com/pricing',
    'https://www.nocobase.com/features',
  ];
  return {
    task: {
      id: 35,
      title: '重复的页面描述',
      brief: '7 个页面共用同一个描述',
      evidence: { no: 35, pages },
    },
    work: {
      revision: 2,
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
    agent: {
      // As the server sends it: the repository serving the task's pages (startedRepo).
      repo: {
        id: 'site',
        repo: 'nocobase/site',
        baseBranch: 'main',
        allowedPaths: [],
      },
      repos: repos.map((r) => ({
        ...r,
        repo: `nocobase/${r.id}`,
        baseBranch: 'main',
        allowedPaths: [],
      })),
      online: true,
      agentId: 'codex',
      options: [{ id: 'codex', name: 'codex' }],
    },
  } as unknown as TaskData;
}
test('the start card lists the pages, with one line for one repository and Changes go to for several', async () => {
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks')
      return Promise.resolve({ playbooks: [OPTIMIZE] });
    // Pages of the site itself: none of them is an article. It answers a little later, as the server does, so the
    // card first lists the pages by address while it looks them up.
    if (resource === 'nrTaskWork' && command === 'pagePlaces')
      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              article: null,
              unchecked: false,
              pages: [
                { url: 'https://www.nocobase.com/pricing', title: 'Pricing' },
                { url: 'https://www.nocobase.com/features', title: 'Features' },
              ],
            }),
          50,
        ),
      );
    return Promise.resolve([]);
  });
  const { unmount } = mount(
    sitePagesTask([{ id: 'site', urls: ['www.nocobase.com'] }]),
    '/actions/35',
  );
  expect(
    await screen.findAllByRole('link', { name: /Pricing|Features/ }),
  ).toHaveLength(2);
  expect(screen.getByText('要改的页面')).toBeTruthy();
  expect(screen.getByText('网站页面 · 改网站代码，提 PR')).toBeTruthy();
  expect(screen.queryByText('改到哪')).toBeNull();
  unmount();
  mount(
    sitePagesTask([
      { id: 'site', urls: ['www.nocobase.com'] },
      { id: 'docs', urls: ['docs.nocobase.com'] },
    ]),
    '/actions/35',
  );
  expect(
    await screen.findAllByRole('link', { name: /Pricing|Features/ }),
  ).toHaveLength(2);
  expect(screen.getByText('要改的页面')).toBeTruthy();
  // The select says it once: no line under the list, and no second Change.
  expect(screen.queryByText('网站页面 · 改网站代码，提 PR')).toBeNull();
  expect(screen.getByText('改到哪')).toBeTruthy();
  expect(screen.getByRole('combobox', { name: '改到哪' })).toHaveTextContent(
    'nocobase/site · PR',
  );
  expect(
    screen.getByText('按页面 www.nocobase.com/pricing 自动选的'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: '确定开始执行' })).toBeEnabled();
});

test('before the start, the message box is where the instructions go', () => {
  mount(blogPageTask(), '/actions/32');
  expect(screen.queryByText('补充说明（可选）')).toBeNull();
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveAttribute(
    'placeholder',
    expect.stringContaining('开始执行时会读取'),
  );
});

// 2026-11-04 user request: Add image is the chat composer's round paperclip button, and the box takes pasted and
// dropped images without a line saying so; a limit shows only once a file breaks it.
const composerOf = () =>
  screen
    .getByRole('textbox', { name: '给执行者的话' })
    .closest<HTMLElement>('[data-slot=input-group]')!;
test('the message box adds images with an icon-only button and shows no paste or limits line', () => {
  mount();
  const box = composerOf();
  const add = within(box).getByRole('button', { name: '添加图片' });
  expect(add).toHaveAttribute('title', '添加图片');
  expect(add).toHaveTextContent(/^$/);
  expect(add.querySelector('svg')).not.toBeNull();
  expect(box).not.toHaveTextContent(/粘贴|拖入|PNG|MB|最多/);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a limit of the message box shows only when an added image breaks it', async () => {
  let uploads = 0,
    fail = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST')
        return Promise.resolve({ ok: true, json: async () => ({}) });
      if (fail) return Promise.resolve({ ok: false, status: 500 });
      const id = `m${++uploads}`;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            id,
            filename: `${id}.png`,
            contentUrl: `/uploads/task-media/${id}.png`,
          },
        }),
      });
    }),
  );
  const objectUrls = {
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  Object.assign(URL, {
    createObjectURL: () => 'blob:image',
    revokeObjectURL: () => undefined,
  });
  try {
    mount();
    const box = composerOf();
    const picker = box.querySelector<HTMLInputElement>('input[type=file]')!;
    const png = (name: string) => new File(['x'], name, { type: 'image/png' });
    fireEvent.change(picker, {
      target: { files: [new File(['x'], 'scan.bmp', { type: 'image/bmp' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'scan.bmp 不是 PNG、JPG、WebP 或 GIF 图片。',
    );
    const large = png('large.png');
    Object.defineProperty(large, 'size', { value: 21 * 1024 * 1024 });
    fireEvent.change(picker, { target: { files: [large] } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'large.png 超过 20 MB。',
    );
    fireEvent.paste(within(box).getByRole('textbox'), {
      clipboardData: {
        files: Array.from({ length: 11 }, (_, i) => png(`shot-${i + 1}.png`)),
        getData: () => '',
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('每条最多 10 张图片。');
    await waitFor(() => expect(uploads).toBe(10));
    expect(
      within(box).getByRole('button', { name: '添加图片' }),
    ).toBeDisabled();
    fireEvent.click(within(box).getByRole('button', { name: '删除图 10' }));
    fail = true;
    fireEvent.change(picker, { target: { files: [png('again.png')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'again.png 上传失败，请重试。',
    );
  } finally {
    Object.assign(URL, objectUrls);
    vi.unstubAllGlobals();
  }
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
  // On the start card, to the public page; Properties no longer repeats the article (2026-11-02).
  await vi.waitFor(() =>
    expect(
      screen
        .getAllByRole('link', { name: new RegExp(title) })
        .map((l) => l.getAttribute('href')),
    ).toEqual(['https://www.nocobase.com/en/blog/workflow-automation-tools']),
  );

  const card = screen.getByRole('region', { name: '等你处理' });
  await user.click(within(card).getByRole('button', { name: '更改' }));
  const dialog = await screen.findByRole('dialog', { name: '更改改动方式' });
  expect(within(dialog).getByLabelText('发布到')).toHaveValue('cms');
  expect(within(dialog).getByRole('radio', { name: '已有文章' })).toBeChecked();
  expect(dialog).toHaveTextContent(
    `已选：${title}（workflow-automation-tools）`,
  );
  // The card itself never opens the old two-column editor.
  expect(within(card).queryByLabelText('发布到')).toBeNull();
  await user.click(within(dialog).getByRole('radio', { name: '新文章' }));
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(screen.queryByRole('dialog', { name: '更改改动方式' })).toBeNull();
  expect(within(card).getByText('发布到 NocoBase CMS')).toBeTruthy();
});

// 2026-11-02 user decision (ui-references/task-brief-2026-11-02/brief-after-start-b.png): once the task starts, what the
// start card held stays on the left, read-only, and Properties no longer repeats the playbook, article or repository.
const STARTED = '开始时交给 Agent 的内容';
function articleStarted() {
  const data = pageChange();
  data.work.article = {
    targetId: 'cms',
    articleId: '7',
    slug: 'top-open-source-no-code-tools',
    title: 'Top 11 Open Source No-Code Tools in 2026',
    sourceKey: null,
  };
  data.work.delivery = {
    kind: 'article',
    targetId: 'cms',
    articleId: '7',
    sourceKey: null,
    also: [{ targetId: 'docs', articleId: null, sourceKey: null }],
    locales: ['zh', 'en', 'ja'],
  };
  data.articleTargets = [
    {
      id: 'cms',
      name: 'NocoBase CMS',
      kind: 'nocobase-api',
      locales: ['en', 'zh', 'ja'],
      capabilities: { concurrency: 'check-before-write' },
      pages: { en: 'https://www.nocobase.com/en/blog/{slug}' },
    },
    {
      id: 'docs',
      name: 'Docs CMS',
      kind: 'nocobase-api',
      locales: ['en'],
      capabilities: { concurrency: 'check-before-write' },
    },
  ];
  return data;
}

test('the properties column lists source, owner, Agent, the page it tracks and the start', async () => {
  const data = articleStarted();
  data.work.page = { url: 'https://www.nocobase.com/ja', title: '' };
  mount(data);
  const column = screen.getByRole('complementary', { name: '属性' });
  const value = (label: string) =>
    within(column).getByText(label, { selector: 'dt' }).nextElementSibling!;
  expect(value('负责人')).toHaveTextContent('Super Admin');
  expect(value('Agent')).toHaveTextContent('codex');
  // Found by the AI from opportunity O-16, kept apart from the owner.
  expect(value('来源')).toHaveTextContent(/Found by AI\s*·\s*O-16/);
  expect(value('来源')).toHaveTextContent('每日分析');
  expect(
    within(value('来源')).getByRole('button', { name: 'O-16' }),
  ).toBeVisible();
  // A related page other than the one the task changes stays.
  expect(within(value('关联页面')).getByRole('link')).toHaveAttribute(
    'href',
    'https://www.nocobase.com/ja',
  );
  expect(value('开始于')).toHaveTextContent('10');
  for (const moved of ['做法', '文章', '仓库'])
    expect(within(column).queryByText(moved, { selector: 'dt' })).toBeNull();
  // The header keeps the title and its menu only; the steps no longer repeat the playbook's name.
  const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
  expect(header).not.toHaveTextContent('Super Admin');
  expect(screen.getByRole('list', { name: '进度' })).not.toHaveTextContent(
    '优化现有页面',
  );
});

test('a started article keeps its brief, playbook, article with its languages and targets on the left, read-only', async () => {
  mount(articleStarted());
  const started = screen.getByRole('region', { name: STARTED });
  expect(started).toHaveTextContent(
    'Agent 收到的任务说明行动目标：恢复 /ja 首页的自然搜索点击量',
  );
  expect(started).toHaveTextContent('做法优化现有页面 · 查看步骤');
  expect(
    within(started).getByRole('link', {
      name: 'Top 11 Open Source No-Code Tools in 2026',
    }),
  ).toHaveAttribute(
    'href',
    'https://www.nocobase.com/en/blog/top-open-source-no-code-tools',
  );
  expect(started).toHaveTextContent('/en/blog/top-open-source-no-code-tools');
  expect(started.querySelector('[data-delivery-languages]')).toHaveTextContent(
    /^语言：中文（主） · 英语 · 日语$/,
  );
  expect(started.querySelector('[data-started-where]')).toHaveTextContent(
    'NocoBase CMS、Docs CMS · 直接发布',
  );
  // Read-only: nothing to choose or change, and it sits under the card for now, above Activity.
  expect(within(started).queryByRole('combobox')).toBeNull();
  expect(within(started).queryByRole('button', { name: '更改' })).toBeNull();
  const now = screen.getByRole('region', { name: '等你处理' });
  const activity = screen.getByRole('region', { name: '动态' });
  expect(
    now.compareDocumentPosition(started) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    started.compareDocumentPosition(activity) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test('a started change of the site names its pages and the repository kept at the start; View steps shows the steps it started with', async () => {
  const user = userEvent.setup();
  const data = pageChange();
  data.work.page = {
    url: 'https://www.nocobase.com/ja',
    title: 'NocoBase 日本語',
  };
  mount(data);
  const started = screen.getByRole('region', { name: STARTED });
  expect(
    within(started).getByRole('link', { name: 'NocoBase 日本語' }),
  ).toHaveAttribute('href', 'https://www.nocobase.com/ja');
  expect(started.querySelector('[data-started-where]')).toHaveTextContent(
    'nocobase/site · PR',
  );
  expect(
    within(started).getByRole('link', { name: 'nocobase/site' }),
  ).toHaveAttribute('href', 'https://github.com/nocobase/site');
  // The related page is the page it changes, so Properties leaves it out.
  const column = screen.getByRole('complementary', { name: '属性' });
  expect(within(column).queryByText('关联页面', { selector: 'dt' })).toBeNull();
  await user.click(within(started).getByRole('button', { name: '查看步骤' }));
  const drawer = await screen.findByRole('dialog', { name: '优化现有页面' });
  const steps = within(drawer).getByRole('list', { name: '步骤' });
  expect(steps).toHaveTextContent('修改');
  expect(steps).toHaveTextContent('看效果并发布');
});

test('relinking the related page after the start leaves the pages it was started with; Properties names the new page', async () => {
  const data = pageChange();
  data.work.startedPages = ['https://www.nocobase.com/ja'];
  data.work.page = {
    url: 'https://www.nocobase.com/pricing',
    title: 'Pricing',
  };
  mount(data);
  const started = screen.getByRole('region', { name: STARTED });
  const pages = started.querySelector('[data-start-pages]') as HTMLElement;
  expect(
    within(pages)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href')),
  ).toEqual(['https://www.nocobase.com/ja']);
  expect(within(started).queryByRole('link', { name: 'Pricing' })).toBeNull();
  const column = screen.getByRole('complementary', { name: '属性' });
  expect(
    within(column).getByText('关联页面', { selector: 'dt' }),
  ).toBeInTheDocument();
  expect(
    within(column).getByRole('link', { name: '/pricing' }),
  ).toHaveAttribute('href', 'https://www.nocobase.com/pricing');
});

test('a task handed over from a document names the document as what the Agent received', async () => {
  const data = pageChange();
  data.task.evidence = {
    ...data.task.evidence,
    handoff: {
      playbook: '竞品内容调研',
      content: '## 结论\n\n竞品的文档比我们多三个检查点。',
    },
  };
  mount(data);
  const started = screen.getByRole('region', { name: STARTED });
  expect(started).toHaveTextContent(
    '“竞品内容调研”交付的文档结论 竞品的文档比我们多三个检查点。',
  );
  // Short: no Expand.
  expect(within(started).queryByRole('button', { name: '展开' })).toBeNull();
});

test('what the task was started with stays once it is closed, and is not shown before the start', async () => {
  const user = userEvent.setup();
  const data = pageChange();
  data.task.brief = Array.from(
    { length: 5 },
    (_, i) => `第 ${i + 1} 段说明`,
  ).join('\n');
  data.work.cancelledAt = '2026-10-14T02:00:00Z';
  mount(data);
  const started = screen.getByRole('region', { name: STARTED });
  await user.click(within(started).getByRole('button', { name: '展开' }));
  expect(within(started).getByRole('button', { name: '收起' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  cleanup();
  mount(savedArticleTask(), '/actions/33');
  await screen.findByRole('button', { name: '确定开始执行' });
  expect(screen.queryByRole('region', { name: STARTED })).toBeNull();
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
    await within(block).findByRole('link', {
      name: '/en/blog/ai-agent-platforms',
    }),
  ).toHaveAttribute('href', pages[0]);
  expect(block).toHaveTextContent('400 · 第 32 位');
  // Three pages, then the rest on request.
  expect(within(block).queryByText('/en/blog/workflow-tools')).toBeNull();
  await user.click(
    within(block).getByRole('button', { name: '还有 1 个页面' }),
  );
  expect(within(block).getByText('/en/blog/workflow-tools')).toBeVisible();
  // What the numbers are and when the comparison comes are the title's ⓘ, not grey lines.
  expect(block).not.toHaveTextContent('近 28 天 · 搜索点击 · 平均排名');
  expect(block).not.toHaveTextContent(
    '上线后在第 7 天、第 28 天和这些数字对比。',
  );
  await user.click(within(block).getByRole('button', { name: '说明' }));
  expect(
    await screen.findByText('近 28 天 · 搜索点击 · 平均排名'),
  ).toBeVisible();
  expect(
    screen.getByText('上线后在第 7 天、第 28 天和这些数字对比。'),
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
  expect(within(card).getByRole('textbox', { name: '标题' })).toHaveValue(
    'Top 12 Open Source No-Code AI Tools (2026)',
  );
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

// 2026-10-24 user request: the article on a page of its own, without the task around it; under review it is edited
// there as in the card (2026-11-04).
test('Full screen opens the article being edited on its own page, and Esc goes back to the task', async () => {
  const user = userEvent.setup();
  mountRoutes(reviewArticle(), '/actions/1');
  const card = screen.getByRole('region', { name: '等你处理' });
  await user.click(within(card).getByLabelText('全屏编辑'));
  expect(screen.getByTestId('where')).toHaveTextContent(
    /^\/actions\/1\/article\?lang=en$/,
  );
  const reader = readerPage();
  expect(within(reader).getByRole('textbox', { name: '标题' })).toHaveValue(
    'Top 12 Open Source No-Code AI Tools (2026)',
  );
  expect(
    within(reader).getByRole('button', { name: '通过并发布' }),
  ).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.getByTestId('where')).toHaveTextContent(/^\/actions\/1$/);
});

// Once the article is live there is nothing to edit: the page reads it, in the language and view of its address.
test('the reading page of a live article follows its language and view', async () => {
  const user = userEvent.setup();
  mountRoutes(liveArticle(), '/actions/1/article?lang=en&view=preview');
  const reader = readerPage();
  expect(
    within(reader).getByRole('heading', {
      name: 'Top 12 Open Source No-Code AI Tools (2026)',
    }),
  ).toBeVisible();
  expect(within(reader).queryByRole('textbox')).toBeNull();
  expect(within(reader).getByRole('button', { name: '预览' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await user.click(within(reader).getByRole('button', { name: '改动' }));
  expect(screen.getByTestId('where')).toHaveTextContent('view=changes');
});

test.each([false, true])(
  'the article page opens from its address and approves (simulated: %s)',
  async (simulated) => {
    const user = userEvent.setup();
    const data = reviewArticle();
    data.task.evidence = { ...data.task.evidence, simulated };
    action.mockImplementation((resource: string, command: string) =>
      Promise.resolve(
        command === 'advance'
          ? data
          : resource === 'nrPlaybooks'
            ? { playbooks: [] }
            : [],
      ),
    );
    mountRoutes(data, '/actions/1/article?lang=en');
    const reader = readerPage();
    expect(within(reader).getByRole('textbox', { name: '标题' })).toHaveValue(
      'Top 12 Open Source No-Code AI Tools (2026)',
    );
    await user.click(
      within(reader).getByRole('button', {
        name: simulated ? '通过并模拟发布' : '通过并发布',
      }),
    );
    const approve = action.mock.calls.find(([, c]) => c === 'advance');
    expect(approve?.[2]?.body).toMatchObject({
      command: 'approveStage',
      artifactId: 'artifact-1',
    });
    expect(approve?.[2]?.body).not.toHaveProperty('release');
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/actions\/1$/),
    );
  },
);

test.each(['page', 'article'])(
  'a simulated %s review keeps its simulation action without mock settings',
  (kind) => {
    const data = kind === 'article' ? reviewArticle() : pageChange();
    data.task.evidence = { ...data.task.evidence, simulated: true };
    if (kind === 'page') delete data.work.results[0]!.pr;
    mount(data);
    const card = screen.getByRole('region', { name: '等你处理' });
    expect(
      within(card).getByRole('button', { name: '通过并模拟发布' }),
    ).toBeVisible();
    expect(
      within(card).queryByRole('button', { name: '通过并发布' }),
    ).toBeNull();
    if (kind === 'page')
      expect(card).toHaveTextContent('改动已完成，请检查后发布');
  },
);

// 2026-10-24 user request: an article in several languages is reviewed in its primary one first, then translated.
// 2026-10-27 user report: the editor opened on empty fields of a language the article did not have yet.
test('the review card edits the languages written, one tab each, from the one asked for', async () => {
  const user = userEvent.setup();
  const data = reviewArticle();
  data.articleTargets = [
    { ...data.articleTargets![0], locales: ['en', 'zh', 'ja'] },
  ] as TaskData['articleTargets'];
  data.articleBases!['base-1'].locales.zh = {
    title: '最受欢迎的开源无代码 AI 工具',
    description: '',
    body: '正文',
  };
  data.work.delivery = {
    kind: 'article',
    targetId: 'cms',
    articleId: '7',
    sourceKey: null,
    locales: ['en', 'zh'],
    translateFrom: { artifactId: 'artifact-0', at: '2026-10-27T00:00:00Z' },
  };
  mount(data);
  const card = screen.getByRole('region', { name: '等你处理' });
  // No Edit directly: the card is the editor.
  expect(within(card).queryByRole('button', { name: '直接编辑' })).toBeNull();
  expect(
    within(card)
      .getAllByRole('tab')
      .map((t) => t.textContent),
  ).toEqual(['英语', '中文']);
  await user.click(within(card).getByRole('tab', { name: '中文' }));
  expect(within(card).getByRole('tab', { name: '中文' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(within(card).getByRole('textbox', { name: '标题' })).toHaveValue(
    '最受欢迎的开源无代码 AI 工具',
  );
});

// 2026-11-04 user request: an article body takes images from its toolbar, without a line saying so.
test('the article body offers images in its toolbar, with no paste or limits line', async () => {
  const data = reviewArticle();
  const [target] = data.articleTargets!;
  data.articleTargets = [
    { ...target, capabilities: { ...target.capabilities, images: true } },
  ] as TaskData['articleTargets'];
  mount(data);
  const card = screen.getByRole('region', { name: '等你处理' });
  const toolbar = await within(card).findByRole('toolbar', { name: '格式' });
  expect(
    within(toolbar).getByRole('button', { name: '添加图片' }),
  ).toBeVisible();
  expect(card).not.toHaveTextContent(/粘贴|拖入/);
});

// 2026-11-04 user report (T-62): the article page opens with the same edits, and Back to task keeps them. The edits
// are kept on the server as they are made, so leaving the task asks nothing about them.
test('Full screen edits the same article, Back to task keeps the edits, and leaving saves them', async () => {
  const user = userEvent.setup();
  function Elsewhere() {
    const navigate = useNavigate();
    return (
      <button type='button' onClick={() => void navigate('/actions')}>
        elsewhere
      </button>
    );
  }
  render(
    <MemoryRouter initialEntries={['/actions/1']}>
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <TaskDraftNavigationGuard />
          <Routes>
            <Route
              path='/actions/:taskId'
              element={
                <TaskDetail
                  projectId={1}
                  taskId='1'
                  initial={reviewArticle()}
                />
              }
            >
              <Route path='article' element={<ArticleReaderPage />} />
            </Route>
            <Route path='/actions' element={<p>Tasks</p>} />
          </Routes>
          <Where />
          <Elsewhere />
        </TaskDraftProvider>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
  const card = screen.getByRole('region', { name: '等你处理' });
  const title = 'Top 12 Open Source No-Code AI Tools (2026)';
  await waitFor(() =>
    expect(
      within(card).getByRole('textbox', { name: '标题' }),
    ).not.toHaveAttribute('readonly'),
  );
  await user.type(
    within(card).getByRole('textbox', { name: '标题' }),
    ' and more',
  );
  expect(card).toHaveTextContent('第 1 版 + 你的修改');
  await user.click(within(card).getByLabelText('全屏编辑'));
  expect(screen.getByTestId('where')).toHaveTextContent(
    /^\/actions\/1\/article\?lang=en$/,
  );
  expect(screen.queryByRole('alertdialog')).toBeNull();
  const reader = readerPage();
  expect(within(reader).getByRole('textbox', { name: '标题' })).toHaveValue(
    `${title} and more`,
  );
  // Already full screen: no second way there.
  expect(within(reader).queryByLabelText('全屏编辑')).toBeNull();
  await user.type(within(reader).getByRole('textbox', { name: '标题' }), '!');
  await user.click(within(reader).getByRole('button', { name: '返回任务' }));
  await waitFor(() =>
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/actions\/1$/),
  );
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(within(card).getByRole('textbox', { name: '标题' })).toHaveValue(
    `${title} and more!`,
  );
  await user.click(screen.getByRole('button', { name: 'elsewhere' }));
  expect(await screen.findByText('Tasks')).toBeVisible();
  expect(screen.queryByRole('alertdialog')).toBeNull();
  // What was typed last is saved as the task closes, then the article is let go.
  await waitFor(() =>
    expect(articleEdit.mock.calls.map(([o]) => o.body.op)).toContain('release'),
  );
  const saves = articleEdit.mock.calls
    .map(([o]) => o.body)
    .filter((b) => b.op === 'save');
  expect(saves.at(-1)).toMatchObject({
    projectId: '1',
    taskId: '1',
    artifactId: 'artifact-1',
    form: { locales: { en: { title: `${title} and more!` } } },
    ai: 0,
  });
  expect(action.mock.calls.some(([, c]) => c === 'advance')).toBe(false);
});

// 2026-11-04 user request: one person edits at a time; the others read the article as that person leaves it.
test('while someone else edits the article, the card is read-only and names them', async () => {
  articleEdit.mockResolvedValue({
    lease: { userId: '2', name: 'Tian Qi', until: '2099-01-01T00:00:00Z' },
    mine: false,
    draft: {
      artifactId: 'artifact-1',
      form: { locales: { en: { title: 'Their title' } } },
      ai: 1,
      savedAt: '2026-11-04T10:20:00Z',
      savedBy: '2',
      savedByName: 'Tian Qi',
    },
  });
  mount(reviewArticle());
  const card = screen.getByRole('region', { name: '等你处理' });
  expect(
    await within(card).findByText(
      'Tian Qi 正在编辑，你现在只能阅读；对方离开后即可编辑。',
    ),
  ).toBeVisible();
  const title = within(card).getByRole('textbox', { name: '标题' });
  expect(title).toHaveValue('Their title');
  expect(title).toHaveAttribute('readonly');
  expect(within(card).queryByRole('toolbar', { name: '格式' })).toBeNull();
  expect(card).toHaveTextContent('第 1 版 + Tian Qi 的修改');
  expect(
    within(card).getByRole('button', { name: '通过并发布' }),
  ).toBeDisabled();
  expect(
    within(card).getByRole('button', { name: '提修改意见' }),
  ).toBeDisabled();
});

// Edits are kept on the server without being a version: they open again as they were left, and Approve makes the
// version of them first, with how many places AI rewrote.
test('kept edits open again with when they were saved, and Approve makes a version of them first', async () => {
  const user = userEvent.setup();
  const data = reviewArticle();
  const edited = structuredClone(data);
  edited.work.revision++;
  edited.work.results = [
    { ...data.work.results[0]!, id: 'artifact-2', version: 2 },
  ];
  action.mockImplementation((resource: string, command: string, o) =>
    Promise.resolve(
      command === 'advance'
        ? (o as { body: { command: string } }).body.command ===
          'editArticleDraft'
          ? edited
          : data
        : resource === 'nrPlaybooks'
          ? { playbooks: [] }
          : [],
    ),
  );
  articleEdit.mockResolvedValue({
    lease: { userId: '1', name: 'Super Admin', until: '2099-01-01T00:00:00Z' },
    mine: true,
    draft: {
      artifactId: 'artifact-1',
      form: { locales: { en: { title: 'Kept title' } } },
      ai: 2,
      savedAt: '2026-11-04T10:20:00Z',
      savedBy: '1',
      savedByName: 'Super Admin',
    },
  });
  mount(data);
  const card = screen.getByRole('region', { name: '等你处理' });
  await waitFor(() =>
    expect(within(card).getByRole('textbox', { name: '标题' })).toHaveValue(
      'Kept title',
    ),
  );
  expect(card).toHaveTextContent('第 1 版 + 你的修改（AI 改写 2 处）');
  expect(within(card).getByText(/^已自动保存 \d{2}:\d{2}$/)).toBeVisible();
  await user.click(within(card).getByRole('button', { name: '通过并发布' }));
  await waitFor(() =>
    expect(action.mock.calls.filter(([, c]) => c === 'advance')).toHaveLength(
      2,
    ),
  );
  const sent = action.mock.calls
    .filter(([, c]) => c === 'advance')
    .map(([, , options]) => options.body);
  expect(sent).toEqual([
    expect.objectContaining({
      command: 'editArticleDraft',
      artifactId: 'artifact-1',
      article: expect.objectContaining({
        locales: { en: expect.objectContaining({ title: 'Kept title' }) },
      }),
      edits: { ai: 2 },
    }),
    expect.objectContaining({
      command: 'approveStage',
      artifactId: 'artifact-2',
      revision: edited.work.revision,
    }),
  ]);
});

test('Discard unversioned changes takes the article back to its version', async () => {
  const user = userEvent.setup();
  const kept = {
    artifactId: 'artifact-1',
    form: { locales: { en: { title: 'Kept title' } } },
    ai: 0,
    savedAt: '2026-11-04T10:20:00Z',
    savedBy: '1',
    savedByName: 'Super Admin',
  };
  articleEdit.mockImplementation((o: { body: { op: string } }) =>
    Promise.resolve({
      lease: null,
      mine: true,
      draft: o.body.op === 'discard' ? null : kept,
    }),
  );
  mount(reviewArticle());
  const card = screen.getByRole('region', { name: '等你处理' });
  const title = within(card).getByRole('textbox', { name: '标题' });
  await waitFor(() => expect(title).toHaveValue('Kept title'));
  await user.click(within(card).getByRole('button', { name: '更多操作' }));
  await user.click(
    await screen.findByRole('menuitem', { name: '放弃未成版的修改' }),
  );
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent('文章回到第 1 版');
  await user.click(within(dialog).getByRole('button', { name: '放弃修改' }));
  await waitFor(() =>
    expect(title).toHaveValue('Top 12 Open Source No-Code AI Tools (2026)'),
  );
  expect(articleEdit.mock.calls.map(([o]) => o.body.op)).toContain('discard');
  expect(action.mock.calls.some(([, c]) => c === 'advance')).toBe(false);
});

test('Activity says how a version edited in the card was made', () => {
  const data = reviewArticle();
  const [first] = data.work.results as NonNullable<
    TaskData['work']['results'][number]
  >[];
  const second = {
    ...first,
    id: 'artifact-2',
    version: 2,
    createdBy: '1',
    createdAt: '2026-10-22T09:00:00Z',
    edits: { ai: 1, hand: 2 },
  };
  data.artifacts = [{ ...first, rejectedAt: '2026-10-22T09:00:00Z' }];
  data.work.results = [second];
  data.work.history = [
    ...(data.work.history || []),
    {
      at: '2026-10-22T09:00:00Z',
      actor: '1',
      action: 'editArticleDraft',
      stageKey: 'review',
      artifactId: 'artifact-2',
    },
  ];
  mount(data);
  const activity = screen.getByRole('region', { name: '动态' });
  expect(
    within(activity).getByText(
      /修改了文章稿，第 2 版（AI 改写 1 处，手改 2 处）/,
    ),
  ).toBeVisible();
});

test('an article in two languages approves the primary to translate, and the card names the translation', () => {
  const data = reviewArticle();
  const delivery = {
    kind: 'article' as const,
    targetId: 'cms',
    articleId: '7',
    sourceKey: null,
    locales: ['en', 'zh'],
  };
  data.work.delivery = delivery;
  const view = mount(data);
  const card = screen.getByRole('region', { name: '等你处理' });
  expect(
    within(card).getByRole('button', { name: '通过，开始翻译' }),
  ).toBeVisible();
  const steps = () => screen.getByRole('list', { name: '进度' });
  expect(steps()).toHaveTextContent('Agent 修改');
  view.unmount();
  const translating = reviewArticle();
  translating.work.delivery = {
    ...delivery,
    translateFrom: { artifactId: 'artifact-1', at: '2026-10-24T00:00:00Z' },
  };
  translating.work.stageIndex = 0;
  translating.runs = [
    {
      id: 'run-t',
      status: 'running',
      planVersion: 0,
      stepId: translating.work.flow!.stages[0].key,
      createdAt: '2026-10-24T00:01:00Z',
    },
  ];
  mount(translating);
  expect(screen.getAllByText('Agent 正在翻译中文')[0]).toBeVisible();
  // The step tags name the step the task went back to for what it does now.
  const current = within(steps())
    .getAllByRole('listitem')
    .find((li) => li.getAttribute('aria-current') === 'step');
  expect(current).toHaveTextContent('Agent 翻译');
  expect(steps()).not.toHaveTextContent('Agent 修改');
});

// 2026-10-28 (T-53): an existing article's other languages get the primary's changes in place, and a version that
// changed none of them read "Translation done".
function updatingArticle(round: 'primary' | 'writing' | 'updated' | 'none') {
  const data = reviewArticle();
  data.articleTargets = [
    { ...data.articleTargets![0], locales: ['en', 'zh'] },
  ] as TaskData['articleTargets'];
  data.articleBases!['base-1'].locales.zh = {
    title: '有 GitHub 星标最多的 11 个开源无代码 AI 工具',
    description: '星标最多的工具。',
    body: '正文',
  };
  data.work.article = {
    targetId: 'cms',
    articleId: '7',
    slug: 'top-11-github-open-source-no-code-ai-tools',
    title: 'Top 11 Open Source No-Code AI Tools with the Most GitHub Stars',
    sourceKey: 'base-1',
    locales: ['en', 'zh'],
  };
  data.work.delivery = {
    kind: 'article',
    targetId: 'cms',
    articleId: '7',
    sourceKey: 'base-1',
    locales: ['en', 'zh'],
    ...(round === 'primary'
      ? {}
      : {
          translateFrom: {
            artifactId: 'artifact-0',
            at: '2026-10-28T13:23:00Z',
          },
        }),
  };
  if (round === 'writing') {
    data.work.stageIndex = 0;
    data.work.history = [
      ...(data.work.history || []),
      {
        at: '2026-10-28T13:23:00Z',
        actor: '1',
        action: 'approveStage',
        stageKey: 'review',
        note: 'update',
      },
    ];
    data.runs = [
      {
        id: 'run-u',
        status: 'running',
        planVersion: 0,
        stepId: data.work.flow!.stages[0].key,
        createdAt: '2026-10-28T13:23:30Z',
      },
    ];
  }
  if (round === 'updated') {
    const article = data.work.results[0]!.article!;
    article.draft.locales.zh = {
      title: '最受欢迎的 12 个开源无代码 AI 工具（2026）',
    };
    article.changes = [...article.changes, 'zh.title'];
  }
  return data;
}

test('an update of an existing article says so at each round, and opens on the edited language', async () => {
  const user = userEvent.setup();
  let view = mount(updatingArticle('primary'));
  let card = screen.getByRole('region', { name: '等你处理' });
  expect(card).toHaveTextContent(
    '英语版已改好，通过后按同样的改动更新其他语言',
  );
  // The other languages are named beside the one edited, not editable until it is approved.
  expect(card).toHaveTextContent('中文 · 通过后更新');
  expect(
    within(card)
      .getAllByRole('tab')
      .map((t) => t.textContent),
  ).toEqual(['英语']);
  expect(
    within(card).getByRole('button', { name: '通过，更新其他语言' }),
  ).toBeVisible();
  view.unmount();
  view = mount(updatingArticle('writing'));
  expect(
    screen.getAllByText('Agent 正在按英语的改动更新中文')[0],
  ).toBeVisible();
  const current = within(screen.getByRole('list', { name: '进度' }))
    .getAllByRole('listitem')
    .find((li) => li.getAttribute('aria-current') === 'step');
  expect(current).toHaveTextContent('Agent 更新其他语言');
  expect(
    screen.getAllByText(/通过了主语言，开始按改动更新其他语言/)[0],
  ).toBeVisible();
  view.unmount();
  mount(updatingArticle('updated'));
  card = screen.getByRole('region', { name: '等你处理' });
  expect(card).toHaveTextContent('已按英语的改动更新中文，确认后一起发布');
  expect(within(card).getByRole('tab', { name: '中文' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(within(card).getByRole('textbox', { name: '标题' })).toHaveValue(
    '最受欢迎的 12 个开源无代码 AI 工具（2026）',
  );
  // What changed is one switch away, read-only.
  await user.click(within(card).getByRole('switch', { name: '对比原文' }));
  expect(within(card).queryByRole('textbox', { name: '标题' })).toBeNull();
  expect(card).toHaveTextContent('摘要 · 未修改');
  expect(
    within(card).getByRole('button', { name: '通过并发布' }),
  ).toBeVisible();
});

test('a version that changed none of the other languages says so and offers Update again first', async () => {
  const user = userEvent.setup();
  const data = updatingArticle('none');
  action.mockImplementation((resource: string, command: string) =>
    Promise.resolve(
      command === 'advance'
        ? data
        : resource === 'nrPlaybooks'
          ? { playbooks: [] }
          : [],
    ),
  );
  mount(data);
  const card = screen.getByRole('region', { name: '等你处理' });
  expect(card).toHaveTextContent('中文没有改动');
  expect(card).not.toHaveTextContent('翻译已完成');
  expect(card).toHaveTextContent(
    'Agent 交回的版本里中文和原来一样。可以让 Agent 再做一次，或在动态里写下要怎么改。',
  );
  expect(
    within(card)
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) =>
        ['重新更新', '提修改意见', '只发布英语'].includes(t || ''),
      ),
  ).toEqual(['重新更新', '只发布英语', '提修改意见']);
  await user.click(within(card).getByRole('button', { name: '重新更新' }));
  const again = action.mock.calls.find(([, c]) => c === 'advance');
  expect(again?.[2]?.body).toMatchObject({
    command: 'requestStageChanges',
    artifactId: 'artifact-1',
    comment: '上一版没有改动中文，请按英语的改动重新更新。',
  });
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

// 2026-10-27 user report (T-49): the title still said "write content" after Keyword research was chosen to start it.
test('an automatic title follows the playbook chosen on the start card', async () => {
  const user = userEvent.setup();
  const data = blogPageTask();
  data.task.title = '内容选题与大纲：ai governance framework';
  data.task.evidence = {
    ...data.task.evidence,
    autoTitle: { subject: 'ai governance framework', locale: 'zh-CN' },
    suggestedPlaybook: 'content-outline',
  };
  data.playbookDefault = 'content-outline';
  const playbook = (id: string, name: string) => ({
    id,
    name,
    kind: 'plan',
    category: 'research',
    steps: [{ key: 'research', name: '调研', kind: 'analyze' }],
  });
  action.mockImplementation((resource: string) =>
    Promise.resolve(
      resource === 'nrPlaybooks'
        ? {
            revision: 1,
            playbooks: [
              playbook('content-outline', '内容选题与大纲'),
              playbook('keyword-research', '关键词调研'),
            ],
          }
        : [],
    ),
  );
  const pick = async (name: string) => {
    await user.click(screen.getByRole('combobox', { name: '做法' }));
    await user.click(await screen.findByRole('option', { name }));
  };
  const view = mount(data, '/actions/32');
  const heading = () => screen.getByRole('heading', { level: 1 });
  await vi.waitFor(() =>
    expect(heading()).toHaveTextContent(
      '内容选题与大纲：ai governance framework',
    ),
  );
  await pick('关键词调研');
  expect(heading()).toHaveTextContent('关键词调研：ai governance framework');
  view.unmount();
  // A title a person wrote stays whatever is chosen.
  const written = blogPageTask();
  written.playbookDefault = 'content-outline';
  mount(written, '/actions/32');
  await vi.waitFor(() =>
    expect(heading()).toHaveTextContent('给工作流自动化博客页改标题'),
  );
  await pick('关键词调研');
  expect(heading()).toHaveTextContent('给工作流自动化博客页改标题');
});

// 2026-10-28 user request: Snooze a task, as Gmail does, from the ⋯ menu; while snoozed the page names it first.
test('Snooze… puts the task aside until a day with what it waits for', async () => {
  const user = userEvent.setup();
  const commands: Record<string, unknown>[] = [];
  const data = pageChange();
  action.mockImplementation(
    (
      resource: string,
      command: string,
      init?: { body?: Record<string, unknown> },
    ) => {
      if (resource === 'nrAnalysis')
        return Promise.resolve({ schedule: { timezone: 'Asia/Shanghai' } });
      if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
      if (command === 'members')
        return Promise.resolve([{ id: '1', name: 'Super Admin' }]);
      if (command === 'advance') {
        commands.push(init!.body!);
        return Promise.resolve(data);
      }
      return Promise.resolve([]);
    },
  );
  mount(data);
  await user.click(screen.getByRole('button', { name: '更多' }));
  await user.click(await screen.findByRole('menuitem', { name: '延后…' }));
  const dialog = await screen.findByRole('dialog', { name: '延后任务' });
  expect(dialog).toHaveTextContent('到那天回到“待确认”');
  expect(
    within(dialog).getByRole('button', { name: '2 周后' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(dialog).toHaveTextContent('上午 9 点回来，并提醒 Super Admin');
  await within(dialog).findByText(/Asia\/Shanghai/);
  await user.type(
    within(dialog).getByRole('textbox', { name: '在等什么' }),
    '等权限文档写好',
  );
  await user.click(within(dialog).getByRole('button', { name: '延后' }));
  const day = new Date(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
      new Date(),
    ) + 'T12:00:00',
  );
  day.setDate(day.getDate() + 14);
  const pad = (n: number) => String(n).padStart(2, '0');
  expect(commands).toEqual([
    expect.objectContaining({
      command: 'snoozeTask',
      day: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`,
      reason: '等权限文档写好',
    }),
  ]);
});

test('a snoozed task says so first, keeps its card, and can be unsnoozed', async () => {
  const user = userEvent.setup();
  const commands: Record<string, unknown>[] = [];
  const data = pageChange();
  data.work.snooze = {
    until: '2099-11-11T01:00:00Z',
    day: '2099-11-11',
    reason: '等权限文档写好',
    at: '2026-10-28T13:05:00Z',
    by: '1',
    byName: 'Super Admin',
  };
  data.work.history = [
    ...data.work.history,
    {
      at: '2026-10-28T13:05:00Z',
      actor: '1',
      action: 'snoozeTask',
      note: '2099-11-11',
      comment: '等权限文档写好',
    },
  ];
  action.mockImplementation(
    (
      resource: string,
      command: string,
      init?: { body?: Record<string, unknown> },
    ) => {
      if (resource === 'nrAnalysis')
        return Promise.resolve({ schedule: { timezone: 'Asia/Shanghai' } });
      if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
      if (command === 'members')
        return Promise.resolve([{ id: '1', name: 'Super Admin' }]);
      if (command === 'advance') {
        commands.push(init!.body!);
        return Promise.resolve(data);
      }
      return Promise.resolve([]);
    },
  );
  mount(data);
  const heading = screen.getByRole('heading', { level: 1 }).parentElement!;
  expect(heading).toHaveTextContent('已延后');
  const card = screen.getByRole('region', { name: '已延后' });
  expect(card).toHaveTextContent(
    `已延后到 ${formatDateTime(data.work.snooze!.until)}`,
  );
  expect(card).toHaveTextContent('等权限文档写好 · Super Admin 10-28 延后');
  // The stage card stays, to act on.
  expect(screen.getByRole('region', { name: '等你处理' })).toBeVisible();
  expect(screen.getByRole('region', { name: '动态' })).toHaveTextContent(
    `把任务延后到 ${formatDateTime(data.work.snooze!.until)}：等权限文档写好`,
  );
  // Snooze… is not offered again: the row changes the day.
  await user.click(screen.getByRole('button', { name: '更多' }));
  expect(screen.queryByRole('menuitem', { name: '延后…' })).toBeNull();
  await user.keyboard('{Escape}');
  await user.click(within(card).getByRole('button', { name: '改日期' }));
  const change = await screen.findByRole('dialog', { name: '改延后日期' });
  // The dialog opens on the day and reason the snooze has.
  expect(change).toHaveTextContent('等权限文档写好');
  await user.click(within(change).getByRole('button', { name: '取消' }));
  await vi.waitFor(() =>
    expect(screen.queryByRole('dialog', { name: '改延后日期' })).toBeNull(),
  );
  await user.click(within(card).getByRole('button', { name: '取消延后' }));
  expect(commands).toEqual([
    expect.objectContaining({ command: 'unsnoozeTask' }),
  ]);
});

// 2026-10-28 user report (T-52): a message sent from Activity while a version waited for review only reached the next
// run, and only Request changes made the Agent revise. Activity's message box is now where changes are asked for, and
// every review card's Request changes takes the person there.
function underReview(kind: string): TaskData {
  if (kind === 'page change') return pageChange();
  if (kind === 'document') {
    const data = pageChange();
    data.work.flow!.stages = data.work.flow!.stages.slice(0, 2);
    delete data.work.results[0]!.pr;
    return data;
  }
  const data = reviewArticle();
  const delivery = {
    kind: 'article' as const,
    targetId: 'cms',
    articleId: '7',
    sourceKey: null,
    locales: ['en', 'zh'],
  };
  // The primary language first, then the translations to publish.
  if (kind === 'primary language') data.work.delivery = delivery;
  if (kind === 'translation') {
    data.work.delivery = {
      ...delivery,
      translateFrom: { artifactId: 'artifact-0', at: '2026-10-27T00:00:00Z' },
    };
    const article = data.work.results[0]!.article!;
    article.draft.locales.zh = { title: '最受欢迎的开源无代码 AI 工具' };
    article.changes = [...article.changes, 'zh.title'];
  }
  return data;
}
test.each([
  ['page change', '改动已完成，请检查后发布'],
  ['article', '文章改动已就绪，确认后发布'],
  ['primary language', '英语版已写好，通过后翻译成其他语言'],
  ['translation', '翻译已完成，确认后一起发布'],
  ['document', '修改已完成，请审核'],
])(
  'a %s under review goes back to the Agent with the change request written for it',
  async (kind, title) => {
    const user = userEvent.setup();
    const data = underReview(kind);
    const article = !['page change', 'document'].includes(kind);
    const comment = '标题里不要写年份，突出免费试用';
    const revising = structuredClone(data);
    revising.work.revision++;
    revising.work.stageIndex = 0;
    revising.work.results = [
      { ...data.work.results[0]!, rejectedAt: '2026-10-28T02:20:00Z' },
    ];
    revising.work.history = [
      ...(data.work.history || []),
      {
        at: '2026-10-28T02:20:00Z',
        actor: '1',
        action: 'requestStageChanges',
        stageKey: 'review',
        artifactId: 'artifact-1',
        comment,
      },
    ];
    revising.runs = [
      {
        id: 'run-3',
        status: 'queued',
        planVersion: 0,
        stepId: 'change',
        createdAt: '2026-10-28T02:20:00Z',
      },
    ];
    action.mockImplementation((resource: string, command: string) =>
      Promise.resolve(
        command === 'advance'
          ? revising
          : command === 'get'
            ? revising
            : resource === 'nrPlaybooks'
              ? { playbooks: [] }
              : command === 'members'
                ? [{ id: '1', name: 'Super Admin' }]
                : [],
      ),
    );
    mount(data);
    const card = screen.getByRole('region', { name: '等你处理' });
    expect(card).toHaveTextContent(title);
    await user.click(within(card).getByRole('button', { name: '提修改意见' }));
    if (article) {
      // An article is edited in its card, so changes across the whole of it are asked in a box there (2026-11-04).
      const box = within(card).getByRole('textbox', {
        name: '提修改意见，整篇交给 Agent 修改',
      });
      expect(box).toHaveFocus();
      await user.type(box, comment);
      await user.click(
        within(card).getByRole('button', { name: '发送给 Agent' }),
      );
      await waitFor(() =>
        expect(action.mock.calls.some(([, c]) => c === 'advance')).toBe(true),
      );
    } else {
      // The card has no box of its own: its button puts the cursor in Activity's.
      const box = screen.getByRole('textbox', { name: '给执行者的话' });
      expect(box).toHaveFocus();
      expect(within(card).queryByRole('textbox')).toBeNull();
      expect(box).toHaveAttribute(
        'placeholder',
        '写修改意见，发送后 Agent 会按意见重新修改',
      );
      await user.type(box, comment);
      await user.click(screen.getByRole('button', { name: '发送意见' }));
      await waitFor(() => expect(box).toHaveValue(''));
    }
    const sent = action.mock.calls
      .filter(([, c]) => c === 'advance')
      .map(([, , options]) => options.body);
    expect(sent).toEqual([
      expect.objectContaining({
        command: 'requestStageChanges',
        stageKey: 'review',
        artifactId: 'artifact-1',
        comment,
        revision: data.work.revision,
      }),
    ]);
    // The Agent starts on it, and Activity shows the request once, as a change request.
    expect(screen.getByRole('region', { name: '当前进度' })).toBeVisible();
    const activity = screen.getByRole('region', { name: '动态' });
    expect(within(activity).getAllByText(comment)).toHaveLength(1);
    expect(within(activity).getByText('提修改意见')).toBeVisible();
  },
);

test('Request changes on the article page asks there, makes a version of the edits, and goes back to the task', async () => {
  const user = userEvent.setup();
  const data = reviewArticle();
  const edited = structuredClone(data);
  edited.work.revision++;
  edited.work.results = [
    { ...data.work.results[0]!, id: 'artifact-2', version: 2 },
  ];
  action.mockImplementation((resource: string, command: string, o) =>
    Promise.resolve(
      command === 'advance'
        ? (o as { body: { command: string } }).body.command ===
          'editArticleDraft'
          ? edited
          : data
        : resource === 'nrPlaybooks'
          ? { playbooks: [] }
          : [],
    ),
  );
  mountRoutes(data, '/actions/1/article?lang=en');
  const reader = readerPage();
  await waitFor(() =>
    expect(
      within(reader).getByRole('textbox', { name: '标题' }),
    ).not.toHaveAttribute('readonly'),
  );
  await user.type(within(reader).getByRole('textbox', { name: '标题' }), '!');
  await user.click(within(reader).getByRole('button', { name: '提修改意见' }));
  expect(screen.getByTestId('where')).toHaveTextContent(
    /^\/actions\/1\/article\?lang=en$/,
  );
  // The edits go to the Agent as the version it works from.
  expect(reader).toHaveTextContent('发送前，你的修改会存成第 2 版');
  await user.type(
    within(reader).getByRole('textbox', {
      name: '提修改意见，整篇交给 Agent 修改',
    }),
    '按选型标准重排',
  );
  await user.click(
    within(reader).getByRole('button', { name: '发送给 Agent' }),
  );
  await waitFor(() =>
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/actions\/1$/),
  );
  const sent = action.mock.calls
    .filter(([, c]) => c === 'advance')
    .map(([, , options]) => options.body);
  expect(sent).toEqual([
    expect.objectContaining({
      command: 'editArticleDraft',
      artifactId: 'artifact-1',
      article: expect.objectContaining({
        locales: {
          en: expect.objectContaining({
            title: 'Top 12 Open Source No-Code AI Tools (2026)!',
          }),
        },
      }),
      edits: { ai: 0 },
    }),
    expect.objectContaining({
      command: 'requestStageChanges',
      artifactId: 'artifact-2',
      comment: '按选型标准重排',
      revision: edited.work.revision,
    }),
  ]);
});

test('saving an existing snooze keeps its configuration day after the schedule timezone loads', async () => {
  const data = pageChange();
  data.work.snooze = {
    until: '2099-11-11T01:00:00Z',
    day: '2099-11-11',
    reason: 'Waiting for documentation',
    at: '2026-10-28T13:05:00Z',
    by: '1',
  };
  const schedule = Promise.withResolvers<{ schedule: { timezone: string } }>();
  const commands: Record<string, unknown>[] = [];
  action.mockImplementation(
    (
      resource: string,
      command: string,
      init?: { body?: Record<string, unknown> },
    ) => {
      if (resource === 'nrAnalysis') return schedule.promise;
      if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
      if (command === 'members')
        return Promise.resolve([{ id: '1', name: 'Super Admin' }]);
      if (command === 'advance') {
        commands.push(init!.body!);
        return Promise.resolve(data);
      }
      return Promise.resolve([]);
    },
  );
  mount(data);
  await userEvent.click(
    within(screen.getByRole('region', { name: '已延后' })).getByRole('button', {
      name: '改日期',
    }),
  );
  const dialog = await screen.findByRole('dialog', { name: '改延后日期' });
  const save = within(dialog).getByRole('button', {
    name: '保存',
    exact: true,
  });
  expect(save).toBeDisabled();
  schedule.resolve({ schedule: { timezone: 'Asia/Shanghai' } });
  await within(dialog).findByText(/Asia\/Shanghai/);
  await userEvent.click(save);
  expect(commands).toEqual([
    expect.objectContaining({
      command: 'snoozeTask',
      day: '2099-11-11',
      reason: 'Waiting for documentation',
    }),
  ]);
});

test.each([
  'missing schedule',
  'missing timezone',
  'invalid timezone',
  'request failed',
])(
  'an unavailable snooze timezone does not block saving the configured calendar day: %s',
  async (failure) => {
    const data = pageChange();
    data.work.snooze = {
      until: '2099-11-11T01:00:00Z',
      day: '2099-11-11',
      at: '2026-10-28T13:05:00Z',
      by: '1',
    };
    const commands: Record<string, unknown>[] = [];
    action.mockImplementation(
      (
        resource: string,
        command: string,
        init?: { body?: Record<string, unknown> },
      ) => {
        if (resource === 'nrAnalysis') {
          if (failure === 'request failed')
            return Promise.reject(new Error('Synthetic network failure'));
          return Promise.resolve({
            schedule:
              failure === 'missing schedule'
                ? null
                : {
                    timezone:
                      failure === 'invalid timezone' ? 'Mars/Olympus' : null,
                  },
          });
        }
        if (resource === 'nrPlaybooks')
          return Promise.resolve({ playbooks: [] });
        if (command === 'members')
          return Promise.resolve([{ id: '1', name: 'Super Admin' }]);
        if (command === 'advance') {
          commands.push(init!.body!);
          return Promise.resolve(data);
        }
        return Promise.resolve([]);
      },
    );
    mount(data);
    await userEvent.click(
      within(screen.getByRole('region', { name: '已延后' })).getByRole(
        'button',
        { name: '改日期' },
      ),
    );
    const dialog = await screen.findByRole('dialog', { name: '改延后日期' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '未配置时，使用服务器时区',
    );
    expect(dialog).toHaveTextContent('自动运行所用时区');
    const save = within(dialog).getByRole('button', {
      name: '保存',
      exact: true,
    });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(commands).toEqual([
      expect.objectContaining({ command: 'snoozeTask', day: '2099-11-11' }),
    ]);
  },
);
