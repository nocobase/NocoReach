import { NavigationGuardProvider } from '@nocobase/app-client';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { formatDateTime } from '../../client/lib/format';
import { TaskDetail } from '../../client/pages/task-detail';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import type { TaskData } from '../../client/pages/task-execution-types';
import type { ArticleEditDraft } from '../../shared/article-edit';
import english from '../../shared/i18n/en.json';

// 2026-11-12 user report: a colleague changed the article after version 4 in the review card, and Activity said
// nothing, so the changes were taken for lost. Activity now ends with a line for changes not made a version yet.

const { action, articleEdit, access } = vi.hoisted(() => ({
  action: vi.fn(),
  articleEdit: vi.fn(),
  access: { allowed: true },
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => {
  const module =
    await original<typeof import('../../client/lib/nocoreach-api')>();
  return {
    ...module,
    nocobaseClient: {
      ...module.nocobaseClient,
      action: (resource: string, command: string, options?: object) =>
        command === 'articleEdit'
          ? articleEdit(options)
          : action(resource, command, options),
      wrapRequests: vi.fn(),
    },
  };
});
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: '1' }, can: () => access.allowed }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));

const SAVED_AT = '2026-11-11T08:20:00Z';
// What the server keeps for the version under review: the form, who saved it and when.
const kept = (by: '1' | '2', ai = 0): ArticleEditDraft => ({
  artifactId: 'artifact-1',
  form: { locales: { en: { title: 'Their title' } } },
  ai,
  savedAt: SAVED_AT,
  savedBy: by,
  savedByName: by === '1' ? 'Super Admin' : 'Tian Qi',
});
const theirs = { userId: '2', name: 'Tian Qi', until: '2099-01-01T00:00:00Z' };
const mine = {
  userId: '1',
  name: 'Super Admin',
  until: '2099-01-01T00:00:00Z',
};

// An update of a CMS article, version 1 waiting for its owner's review.
function reviewArticle(): TaskData {
  return {
    task: {
      id: 1,
      title: 'Update the no-code AI tools post',
      brief: 'Add the 2026 picks',
      evidence: { no: 7 },
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
          content: 'Added the 2026 picks.',
          createdAt: '2026-11-11T02:00:00Z',
          createdBy: 'agent',
          article: {
            targetId: 'cms',
            articleId: '7',
            baseKey: 'base-1',
            baseVersion: 'v1',
            draft: {
              locales: {
                en: {
                  title: 'Top 12 Open Source No-Code AI Tools (2026)',
                  description: 'Updated for 2026.',
                },
              },
            },
            changes: ['en.description', 'en.title'],
          },
        },
      ],
      history: [
        { at: '2026-11-11T01:00:00Z', actor: '1', action: 'startTask' },
        {
          at: '2026-11-11T02:00:00Z',
          actor: 'system',
          action: 'runSucceeded',
          runId: 'run-1',
          artifactId: 'artifact-1',
        },
      ],
    },
    runs: [],
    artifacts: [],
    reviews: [],
    agent: {
      repo: null,
      online: true,
      agentId: 'codex',
      options: [{ id: 'codex', name: 'codex' }],
    },
    articleTargets: [
      {
        id: 'cms',
        name: 'NocoBase CMS',
        kind: 'nocobase-api',
        locales: ['en'],
        capabilities: { concurrency: 'check-before-write' },
      },
    ],
    articleBases: {
      'base-1': {
        id: '7',
        slug: 'top-11-open-source-no-code-ai-tools',
        version: 'v1',
        readAt: '2026-11-11T00:50:00Z',
        locales: {
          en: {
            title: 'Top 11 Open Source No-Code AI Tools',
            description: 'The most starred tools.',
            body: 'Body',
          },
        },
      },
    },
  } as unknown as TaskData;
}

beforeEach(() => {
  setDictionary(null);
  access.allowed = true;
  articleEdit.mockReset();
  articleEdit.mockResolvedValue({ lease: null, mine: true, draft: null });
  action.mockReset();
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
    if (command === 'members')
      return Promise.resolve([
        { id: '1', name: 'Super Admin' },
        { id: '2', name: 'Tian Qi' },
      ]);
    return Promise.resolve([]);
  });
});
afterEach(() => cleanup());

function mount(data = reviewArticle()) {
  return render(
    <MemoryRouter initialEntries={['/actions/1']}>
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <TaskDetail projectId={1} taskId='1' initial={data} />
        </TaskDraftProvider>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
}
const activity = () => screen.getByRole('region', { name: '动态' });
const lines = () =>
  within(activity())
    .getAllByRole('listitem')
    .map((li) => li.textContent);
const unversioned = () => within(activity()).queryByText(/还没存成版本/);

test("someone else's changes end Activity with who made them, the AI rewrites and when they were saved", async () => {
  const user = userEvent.setup();
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  articleEdit.mockResolvedValue({
    lease: theirs,
    mine: false,
    draft: kept('2', 2),
  });
  mount();
  const line = (await within(activity()).findByText(/还没存成版本/)).closest(
    'li',
  )!;
  expect(line).toHaveTextContent(
    `Tian Qi 修改了文章稿，还没存成版本（AI 改写 2 处） 查看${formatDateTime(SAVED_AT)}`,
  );
  expect(
    within(line).getByText('Tian Qi', { selector: '[data-actor]' }),
  ).toBeVisible();
  expect(within(line).getByRole('time')).toHaveTextContent(
    formatDateTime(SAVED_AT),
  );
  // The same row as a version's line: the same icon box, muted text, the actor in the text colour.
  const version = within(activity())
    .getByText(/交付了/)
    .closest('li')!;
  expect(line.className).toBe(version.className);
  expect(line.firstElementChild!.className).toBe(
    version.firstElementChild!.className,
  );
  expect(lines().at(-1)).toBe(line.textContent);
  // The card says the same: the version with Tian Qi's changes.
  const card = screen.getByRole('region', { name: '等你处理' });
  expect(card).toHaveTextContent('第 1 版 + Tian Qi 的修改');
  // View brings the review card, where the changes are, into view.
  await user.click(within(line).getByRole('button', { name: '查看' }));
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(scroll.mock.contexts[0]).toBe(card);
});

test('your own changes are named as yours', async () => {
  articleEdit.mockResolvedValue({ lease: mine, mine: true, draft: kept('1') });
  mount();
  const line = (await within(activity()).findByText(/还没存成版本/)).closest(
    'li',
  )!;
  expect(
    within(line).getByText('你', { selector: '[data-actor]' }),
  ).toBeVisible();
  expect(line).toHaveTextContent('你 修改了文章稿，还没存成版本 查看');
  expect(line).not.toHaveTextContent('AI 改写');
});

test('in English the line reads after the name and after You', async () => {
  setDictionary(english, 'en-US');
  articleEdit.mockResolvedValue({
    lease: mine,
    mine: true,
    draft: kept('1', 1),
  });
  const view = mount();
  expect(
    await within(screen.getByRole('region', { name: 'Activity' })).findByText(
      /edited the article draft, not saved as a version yet \(AI rewrites: 1\)/,
    ),
  ).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Activity' })).getByText('You', {
      selector: '[data-actor]',
    }),
  ).toBeVisible();
  view.unmount();
  articleEdit.mockResolvedValue({ lease: null, mine: true, draft: kept('2') });
  mount();
  const activity = screen.getByRole('region', { name: 'Activity' });
  const line = (
    await within(activity).findByText(/not saved as a version yet/)
  ).closest('li')!;
  expect(line).toHaveTextContent(
    'Tian Qi edited the article draft, not saved as a version yet View',
  );
});

// Whoever may not edit never opens the article: the task read tells them who changed it and when, not what.
test('a reader who may not edit sees the line from the task read, without the changes', async () => {
  access.allowed = false;
  const data = reviewArticle();
  data.unversionedEdits = {
    artifactId: 'artifact-1',
    ai: 0,
    savedAt: SAVED_AT,
    savedBy: '2',
    savedByName: 'Tian Qi',
  };
  mount(data);
  const line = (await within(activity()).findByText(/还没存成版本/)).closest(
    'li',
  )!;
  expect(line).toHaveTextContent('Tian Qi 修改了文章稿，还没存成版本 查看');
  expect(articleEdit).not.toHaveBeenCalled();
  expect(document.body).not.toHaveTextContent('Their title');
  // A summary for another version is not this one's.
  cleanup();
  data.unversionedEdits = {
    ...data.unversionedEdits,
    artifactId: 'artifact-0',
  };
  mount(data);
  expect(unversioned()).toBeNull();
});

test('the line follows the editing session: gone once the changes are discarded, though the task read had them', async () => {
  const data = reviewArticle();
  data.unversionedEdits = {
    artifactId: 'artifact-1',
    ai: 0,
    savedAt: SAVED_AT,
    savedBy: '2',
    savedByName: 'Tian Qi',
  };
  let answer!: (value: unknown) => void;
  articleEdit.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  mount(data);
  // Until the session answers, the task read speaks for it.
  expect(unversioned()).toBeVisible();
  answer({ lease: null, mine: true, draft: null });
  await waitFor(() => expect(unversioned()).toBeNull());
});

test('once the changes are a version, the line becomes that version', async () => {
  const data = reviewArticle();
  const [first] = data.work.results as NonNullable<
    TaskData['work']['results'][number]
  >[];
  data.artifacts = [first];
  data.work.results = [
    {
      ...first,
      id: 'artifact-2',
      version: 2,
      createdBy: '2',
      createdAt: '2026-11-11T09:00:00Z',
      edits: { ai: 2, hand: 1 },
    },
  ];
  data.work.history.push({
    at: '2026-11-11T09:00:00Z',
    actor: '2',
    action: 'editArticleDraft',
    stageKey: 'review',
    artifactId: 'artifact-2',
  });
  data.unversionedEdits = null;
  mount(data);
  expect(
    await within(activity()).findByText(
      /修改了文章稿，第 2 版（AI 改写 2 处，手改 1 处）/,
    ),
  ).toBeVisible();
  await waitFor(() => expect(articleEdit).toHaveBeenCalled());
  expect(unversioned()).toBeNull();
});

test('the line takes its place by when the changes were saved', async () => {
  const data = reviewArticle();
  data.work.history.push({
    at: '2026-11-11T09:30:00Z',
    actor: '1',
    action: 'comment',
    comment: 'Please keep the intro short.',
  });
  articleEdit.mockResolvedValue({ lease: null, mine: true, draft: kept('2') });
  mount(data);
  await within(activity()).findByText(/还没存成版本/);
  const all = lines();
  expect(all.findIndex((t) => /还没存成版本/.test(t!))).toBe(all.length - 2);
  expect(all.at(-1)).toContain('Please keep the intro short.');
});

// The page took over someone's changes (their lease ran out): theirs until this person changes something, then theirs
// and saved as this person's.
test('changes taken over are named as theirs until you change them', async () => {
  const user = userEvent.setup();
  articleEdit.mockImplementation((o: { body: { op: string } }) =>
    Promise.resolve({
      lease: mine,
      mine: true,
      draft:
        o.body.op === 'save'
          ? { ...kept('1'), savedAt: '2026-11-11T10:00:00Z' }
          : kept('2'),
    }),
  );
  mount();
  const card = screen.getByRole('region', { name: '等你处理' });
  const title = within(card).getByRole('textbox', { name: '标题' });
  await waitFor(() => expect(title).toHaveValue('Their title'));
  expect(card).toHaveTextContent('第 1 版 + Tian Qi 的修改');
  expect(
    within(activity()).getByText('Tian Qi', { selector: '[data-actor]' }),
  ).toBeVisible();
  await user.type(title, '!');
  expect(card).toHaveTextContent('第 1 版 + 你的修改');
  await waitFor(
    () =>
      expect(
        within(activity()).getByText('你', { selector: '[data-actor]' }),
      ).toBeVisible(),
    { timeout: 5000 },
  );
  expect(card).toHaveTextContent('第 1 版 + 你的修改');
});
