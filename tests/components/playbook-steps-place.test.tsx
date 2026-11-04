import '@testing-library/jest-dom/vitest';
import { NavigationGuardProvider } from '@nocobase/app-client';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { $t, setDictionary } from '../../client/i18n';
import { PlaybookSteps } from '../../client/pages/playbook-steps';
import { TaskDetail } from '../../client/pages/task-detail';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import type { TaskData } from '../../client/pages/task-execution-types';
import english from '../../shared/i18n/en.json';

// View steps says where the task changes things (2026-11-04): Improve existing page also edits CMS articles (T-55,
// T-62), whose steps said the Agent opens a PR and Publish merges it.

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

const IMPROVE = {
  id: 'optimize-page',
  name: 'Improve existing page',
  kind: 'build',
  category: 'optimize',
  description: 'Improve the title, description, structure and content.',
  version: 1,
  next: [],
  steps: [
    {
      key: 'plan',
      name: 'Plan',
      kind: 'analyze',
      instruction: 'Read the page and write what to change.',
    },
    { key: 'review-plan', name: 'Review plan', kind: 'review', checklist: [] },
    {
      key: 'build',
      name: 'Change',
      kind: 'change',
      instruction: 'Rewrite the title and description.',
    },
    { key: 'review', name: 'Review', kind: 'review', checklist: [] },
  ],
};
const CMS = {
  id: 'cms',
  name: 'NocoBase CMS',
  kind: 'nocobase-api',
  locales: ['en'],
  capabilities: { concurrency: 'check-before-write' },
  default: true,
  pages: { en: 'https://www.nocobase.com/en/blog/{slug}' },
};
const DOCS = {
  id: 'docs',
  name: 'Docs CMS',
  kind: 'nocobase-api',
  locales: ['en'],
  capabilities: { concurrency: 'check-before-write' },
};
const SITE = {
  id: 'site',
  repo: 'nocobase/site',
  baseBranch: 'main',
  allowedPaths: [],
  urls: ['www.nocobase.com'],
};
const BLOG = 'https://www.nocobase.com/en/blog/workflow-automation-tools';

/** A task not started yet, on a page of the blog, in a project with a publishing target and the site's repository. */
function waiting(): TaskData {
  return {
    task: {
      id: 62,
      title: 'Rewrite the title of the workflow automation post',
      brief: 'Goal: turn impressions into clicks',
      evidence: { no: 62 },
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
      page: {
        url: BLOG,
        title: '5 Best Tools for Building Workflow Automation',
      },
    },
    runs: [],
    artifacts: [],
    reviews: [],
    playbookDefault: 'optimize-page',
    articleTargets: [CMS],
    agent: {
      repo: SITE,
      repos: [SITE],
      online: true,
      agentId: 'codex',
      options: [{ id: 'codex', name: 'codex' }],
    },
  } as unknown as TaskData;
}

/** The same task started with Improve existing page, its change at the review step. */
function started(): TaskData {
  const data = waiting();
  data.work = {
    ...data.work,
    stage: 'flow',
    stageIndex: 3,
    playbook: {
      id: 'optimize-page',
      name: 'Improve existing page',
      kind: 'build',
      version: 1,
      next: [],
    },
    flow: {
      id: 'optimize-page',
      name: 'Improve existing page',
      version: 1,
      stages: [
        { key: 'plan', name: 'Plan', kind: 'agent', mode: 'analyze' },
        { key: 'review-plan', name: 'Review plan', kind: 'review' },
        { key: 'build', name: 'Change', kind: 'agent', mode: 'change' },
        { key: 'review', name: 'Review', kind: 'review' },
        { key: 'release', name: 'Live', kind: 'release' },
        { key: 'observe', name: 'Watch', kind: 'observe' },
      ],
    },
    history: [{ at: '2026-11-03T02:00:00Z', actor: '1', action: 'startTask' }],
  };
  return data;
}

/** Started on the CMS article that holds the page, also published to a second target. */
function startedOnArticle(): TaskData {
  const data = started();
  data.articleTargets = [CMS, DOCS] as TaskData['articleTargets'];
  data.work.article = {
    targetId: 'cms',
    articleId: '501',
    slug: 'workflow-automation-tools',
    title: '5 Best Tools for Building Workflow Automation',
    sourceKey: null,
  };
  data.work.delivery = {
    kind: 'article',
    targetId: 'cms',
    articleId: '501',
    sourceKey: null,
    also: [{ targetId: 'docs', articleId: null, sourceKey: null }],
  };
  return data;
}

beforeEach(() => {
  setDictionary(english as Record<string, string>, 'en-US');
  action.mockReset();
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks')
      return Promise.resolve({ revision: 1, playbooks: [IMPROVE] });
    if (command === 'members')
      return Promise.resolve([{ id: '1', name: 'Super Admin' }]);
    if (resource === 'nrTaskWork' && command === 'pagePlaces')
      return Promise.resolve({ article: null, unchecked: false, pages: [] });
    return Promise.resolve([]);
  });
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});

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

/** Opens View steps in the region named `card` and returns the list of steps. */
async function viewSteps(card: string) {
  const user = userEvent.setup();
  const region = await screen.findByRole('region', { name: card });
  await user.click(
    await within(region).findByRole('button', {
      name: $t('taskDetail.viewSteps'),
    }),
  );
  const drawer = await screen.findByRole('dialog', {
    name: 'Improve existing page',
  });
  return within(drawer).getByRole('list', { name: $t('common.steps') });
}

/** The step whose line starts with `name` after its number. */
const step = (steps: HTMLElement, name: string) => {
  const found = within(steps)
    .getAllByRole('listitem')
    .find((li) => li.querySelector('p')?.textContent?.includes(`. ${name}`));
  if (!found) throw new Error(`No step ${name}`);
  return found;
};
const changeStep = (steps: HTMLElement) => step(steps, 'Agent Change');
const publishStep = (steps: HTMLElement) =>
  step(steps, $t('playbook.publishStage'));

const steps = IMPROVE.steps as Parameters<typeof PlaybookSteps>[0]['steps'];

test('an article task edits the article in its target and publishes there, without a PR', () => {
  render(
    <PlaybookSteps
      steps={steps}
      place={{ kind: 'article', targets: ['NocoBase CMS', 'Docs CMS'] }}
    />,
  );
  const list = screen.getByRole('list', { name: $t('common.steps') });
  expect(changeStep(list)).toHaveTextContent(
    'Edits the article in NocoBase CMS',
  );
  expect(publishStep(list)).toHaveTextContent(
    'Publish to NocoBase CMS and Docs CMS, then confirm the change is live',
  );
  expect(list).toHaveTextContent('Writes a document without changing the site');
  expect(list).not.toHaveTextContent(/\bPR\b/);
});

test('a new article is written for its target', () => {
  render(
    <PlaybookSteps
      steps={steps}
      place={{ kind: 'article', targets: ['NocoBase CMS'], created: true }}
    />,
  );
  const list = screen.getByRole('list', { name: $t('common.steps') });
  expect(changeStep(list)).toHaveTextContent(
    'Writes a new article for NocoBase CMS',
  );
  expect(publishStep(list)).toHaveTextContent(
    'Publish to NocoBase CMS, then confirm the change is live',
  );
});

test('a change of the site opens a PR and Publish merges it', () => {
  render(<PlaybookSteps steps={steps} place={{ kind: 'repo' }} />);
  const list = screen.getByRole('list', { name: $t('common.steps') });
  expect(changeStep(list)).toHaveTextContent(
    'Changes the repository and opens a PR',
  );
  expect(publishStep(list)).toHaveTextContent(
    'Merge the PR and confirm the change is live',
  );
});

test('where the place is not known, as on Playbooks, the words cover the repository and the CMS', () => {
  render(<PlaybookSteps steps={steps} />);
  const list = screen.getByRole('list', { name: $t('common.steps') });
  expect(changeStep(list)).toHaveTextContent(
    'Opens a PR for the site repository, or edits the article in the CMS',
  );
  expect(publishStep(list)).toHaveTextContent(
    'Merge the PR or publish to the CMS, then confirm the change is live',
  );
});

test('a started article task says View steps edits the article in its targets', async () => {
  mount(startedOnArticle());
  const list = await viewSteps($t('taskDetail.givenAtStart'));
  expect(changeStep(list)).toHaveTextContent(
    'Edits the article in NocoBase CMS',
  );
  expect(publishStep(list)).toHaveTextContent(
    'Publish to NocoBase CMS and Docs CMS, then confirm the change is live',
  );
  expect(list).not.toHaveTextContent(/\bPR\b/);
});

test('a started new article stays one once published, when the delivery gets its id', async () => {
  const data = started();
  data.work.delivery = {
    kind: 'article',
    targetId: 'cms',
    articleId: '512',
    sourceKey: null,
  };
  mount(data);
  const list = await viewSteps($t('taskDetail.givenAtStart'));
  expect(changeStep(list)).toHaveTextContent(
    'Writes a new article for NocoBase CMS',
  );
});

test('a started change of the site keeps the PR words', async () => {
  mount(started());
  const list = await viewSteps($t('taskDetail.givenAtStart'));
  expect(changeStep(list)).toHaveTextContent(
    'Changes the repository and opens a PR',
  );
  expect(publishStep(list)).toHaveTextContent(
    'Merge the PR and confirm the change is live',
  );
});

test('before the start, View steps follows the article the start card names', async () => {
  const data = waiting();
  data.work.article = {
    targetId: 'cms',
    articleId: '501',
    slug: 'workflow-automation-tools',
    title: '5 Best Tools for Building Workflow Automation',
    sourceKey: null,
  };
  mount(data);
  const list = await viewSteps($t('common.needsAction'));
  expect(changeStep(list)).toHaveTextContent(
    'Edits the article in NocoBase CMS',
  );
  expect(publishStep(list)).toHaveTextContent(
    'Publish to NocoBase CMS, then confirm the change is live',
  );
});

test('before the start, a project without publishing targets changes the site by PR', async () => {
  const data = waiting();
  data.articleTargets = [];
  mount(data);
  const list = await viewSteps($t('common.needsAction'));
  expect(changeStep(list)).toHaveTextContent(
    'Changes the repository and opens a PR',
  );
});

test('before the start, while the article is still to be picked, the words cover both', async () => {
  const data = waiting();
  delete data.work.page;
  mount(data);
  const list = await viewSteps($t('common.needsAction'));
  expect(changeStep(list)).toHaveTextContent(
    'Opens a PR for the site repository, or edits the article in the CMS',
  );
  expect(publishStep(list)).toHaveTextContent(
    'Merge the PR or publish to the CMS, then confirm the change is live',
  );
});
