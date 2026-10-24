import { NavigationGuardProvider } from '@nocobase/app-client';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import english from '../../shared/i18n/en.json';
import { localizeWorkSnapshots } from '../../client/pages/playbook-snapshot';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import {
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import { TaskDetail } from '../../client/pages/task-detail';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import { workTypeLabel } from '../../client/pages/work-board';
import { stepOf } from '../../client/pages/task-list-model';
import { closedWhen } from '../../client/pages/task-execution-types';
import type { TaskData } from '../../client/pages/task-execution-types';
import {
  SYSTEM_PLAYBOOKS,
  stagesFor,
} from '../../server/nocoreach/execution/playbook';

vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: 'root' }, isAdmin: true, can: () => true }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useUnsavedWarning: () => {},
  useProject: () => ({ project: { id: 1, name: 'Example', domains: [] } }),
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async (resource: string) =>
      resource === 'nrPlaybooks' ? { revision: 0, playbooks: [] } : [],
    ),
  },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
});

// Use the production canonical definitions and stagesFor, in startTask's snapshot shape.
function task(id = 'tech-fix'): TaskData {
  const p = SYSTEM_PLAYBOOKS.find((p) => p.id === id)!;
  const provenance = { system: true, edited: false };
  return {
    task: { id: 1, title: '分析。任务。 {0}', brief: '原始说明 {0}' },
    work: {
      revision: 1,
      stage: 'flow',
      plan: null,
      planVersion: 0,
      step: 0,
      results: [],
      history: [],
      stageIndex: 0,
      playbook: {
        id: p.id,
        name: p.name,
        kind: p.kind,
        version: p.version,
        next: [...p.next],
        ...provenance,
      },
      flow: {
        id: p.id,
        name: p.name,
        version: p.version,
        stages: structuredClone(stagesFor(p)),
        ...provenance,
      },
    },
    runs: [],
    artifacts: [],
    reviews: [],
    agent: { repo: null, online: false },
  };
}
// The playbook's name is in the Playbook row of the task's properties column (2026-10-22), not the steps.
const playbookCell = () =>
  [...document.querySelectorAll('aside dt')].find((dt) =>
    ['Playbook', '做法'].includes(dt.textContent || ''),
  )?.nextElementSibling;

async function setup(data: TaskData, locale: 'zh-CN' | 'en-US' = 'en-US') {
  const runtime = new I18nRuntime({
    defaultLocale: locale,
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  function Page() {
    useNocoReachLocale();
    return (
      <>
        <p data-testid='board'>{workTypeLabel(data.work)}</p>
        <p data-testid='step'>{stepOf(data.work)?.text}</p>
        <TaskDetail projectId={1} taskId='1' initial={data} />
      </>
    );
  }
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter>
        <NavigationGuardProvider>
          <TaskDraftProvider>
            <Page />
          </TaskDraftProvider>
        </NavigationGuardProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
  await screen.findByRole('heading', { name: data.task.title });
  return runtime;
}

test('localizes proven built-in snapshot names without changing stored data or mounted drafts', async () => {
  const data = task(),
    before = structuredClone(data);
  const runtime = await setup(data);
  const composer = screen.getByRole('textbox', {
    name: 'Note to the executor',
  });
  await userEvent.setup().type(composer, '自己的草稿 {{0}');
  expect(screen.getByTestId('board')).toHaveTextContent(
    'Technical fix · Write plan',
  );
  expect(screen.getByTestId('step')).toHaveTextContent('Agent: Write plan');
  expect(playbookCell()).toHaveTextContent('Technical fix');
  expect(document.querySelector('.nr-td-stepbar')).toHaveTextContent(
    'Review plan',
  );
  expect(document.querySelector('.nr-td-stepbar')).toHaveTextContent(
    'Review (you)Publish',
  );
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(screen.getByTestId('board')).toHaveTextContent('技术修复 · 制定方案');
  await act(() => runtime.changeLanguage('en-US'));
  expect(screen.getByTestId('board')).toHaveTextContent(
    'Technical fix · Write plan',
  );
  expect(screen.getByRole('textbox', { name: 'Note to the executor' })).toBe(
    composer,
  );
  expect(composer).toHaveValue('自己的草稿 {0}');
  expect(
    screen.getByRole('heading', { name: '分析。任务。 {0}' }),
  ).toBeInTheDocument();
  expect(data).toEqual(before);
});

test('every canonical built-in name is localized in English and restored in Chinese', () => {
  for (const p of SYSTEM_PLAYBOOKS) {
    const data = task(p.id),
      original = structuredClone(data);
    setDictionary(english);
    const view = localizeWorkSnapshots(data.work);
    expect(view.playbook?.name).not.toMatch(/[一-鿿]/u);
    for (const stage of view.flow!.stages)
      expect(stage.name).not.toMatch(/[一-鿿]/u);
    setDictionary(null);
    expect(localizeWorkSnapshots(data.work)).toEqual(data.work);
    expect(data).toEqual(original);
  }
});

test.each(['custom', 'edited', 'clone', 'legacy', 'partial-origin'] as const)(
  'preserves %s snapshot names and literal placeholders despite known dictionary words',
  async (variant) => {
    const data = task('change-research');
    const flow = data.work.flow!,
      playbook = data.work.playbook!;
    if (variant === 'custom' || variant === 'clone') {
      flow.id = playbook.id = 'custom-12345678';
      flow.system = playbook.system = false;
      flow.version = playbook.version = 1;
    } else if (variant === 'edited') {
      flow.edited = playbook.edited = true;
      flow.version = playbook.version = 4;
    } else if (variant === 'legacy') {
      delete flow.system;
      delete flow.edited;
      delete playbook.system;
      delete playbook.edited;
    } else {
      delete flow.edited;
      delete playbook.edited;
    }
    flow.name = playbook.name = '分析。任务。 {0}';
    flow.stages[0].name = '分析';
    const before = structuredClone(data);
    const runtime = await setup(data);
    expect(screen.getByTestId('board')).toHaveTextContent(
      '分析。任务。 {0} · 分析',
    );
    expect(playbookCell()).toHaveTextContent('分析。任务。 {0}');
    expect(document.querySelector('.nr-td-stepbar')).toHaveTextContent('分析');
    await act(() => runtime.changeLanguage('zh-CN'));
    await act(() => runtime.changeLanguage('en-US'));
    expect(screen.getByTestId('board')).toHaveTextContent(
      '分析。任务。 {0} · 分析',
    );
    expect(data).toEqual(before);
  },
);

test('unknown names stay raw even with system provenance, without fuzzy translation', () => {
  setDictionary(english);
  const data = task();
  data.work.flow!.name = '分析。任务。 {0}';
  data.work.playbook!.name = '分析。任务。 {0}';
  data.work.flow!.stages[0].name = '分析。任务。 {0}';
  expect(localizeWorkSnapshots(data.work).playbook!.name).toBe(
    '分析。任务。 {0}',
  );
  expect(localizeWorkSnapshots(data.work).flow!.stages[0].name).toBe(
    '分析。任务。 {0}',
  );
});

test('canonical-identical legacy snapshots use display-only compatibility without adding provenance', () => {
  setDictionary(english);
  const data = task('change-research');
  delete data.work.flow!.system;
  delete data.work.flow!.edited;
  delete data.work.playbook!.system;
  delete data.work.playbook!.edited;
  const before = structuredClone(data);
  expect(workTypeLabel(data.work)).toBe('Change investigation · Analysis');
  expect(data).toEqual(before);
  expect(data.work.flow).not.toHaveProperty('system');
});

test('legacy compatibility compares every available field and rejects incomplete or changed pairs', () => {
  setDictionary(english);
  const legacy = () => {
    const data = task('change-research');
    delete data.work.flow!.system;
    delete data.work.flow!.edited;
    delete data.work.playbook!.system;
    delete data.work.playbook!.edited;
    return data;
  };
  const mutations: ((data: TaskData) => void)[] = [
    (d) => {
      d.work.flow!.id = d.work.playbook!.id = 'custom-copy';
    },
    (d) => {
      d.work.flow!.version = d.work.playbook!.version = 4;
    },
    (d) => {
      d.work.flow!.version = 2;
    },
    (d) => {
      d.work.playbook!.name = '分析';
    },
    (d) => {
      d.work.flow!.name = '分析';
    },
    (d) => {
      d.work.playbook!.kind = 'build';
    },
    (d) => {
      d.work.playbook!.next = [];
    },
    (d) => {
      d.work.flow!.stages[0].key = 'renamed';
    },
    (d) => {
      d.work.flow!.stages[0].name = '任务 {0}';
    },
    (d) => {
      d.work.flow!.stages[0].kind = 'ai';
    },
    (d) => {
      d.work.flow!.stages[0].mode = 'change';
    },
    (d) => {
      d.work.flow!.stages[0].instruction += ' ';
    },
    (d) => {
      d.work.flow!.stages[0].skills = ['custom-skill'];
    },
    (d) => {
      d.work.flow!.stages[1].checklist![0].label = '用户文字';
    },
    (d) => {
      d.work.flow!.stages[1].checklist![0].required = false;
    },
    (d) => {
      d.work.flow!.stages = [...d.work.flow!.stages].reverse();
    },
    (d) => {
      d.work.flow = { ...d.work.flow!, ...{ unknown: true } };
    },
    (d) => {
      d.work.playbook = {
        ...d.work.playbook!,
        ...{ copiedFrom: 'change-research' },
      };
    },
    (d) => {
      d.work.flow!.stages[0] = { ...d.work.flow!.stages[0], ...{ version: 1 } };
    },
    (d) => {
      d.work.flow!.edited = true;
    },
    (d) => {
      d.work.playbook!.system = false;
    },
    (d) => {
      d.work.flow!.system = true;
    },
    (d) => {
      delete d.work.playbook;
    },
  ];
  for (const mutate of mutations) {
    const data = legacy();
    mutate(data);
    expect(localizeWorkSnapshots(data.work)).toEqual(data.work);
  }
  const data = legacy();
  data.work.flow = {
    stages: data.work.flow!.stages,
    version: 3,
    name: '变化原因调研',
    id: 'change-research',
  };
  expect(workTypeLabel(data.work)).toBe('Change investigation · Analysis');
});

test('custom IDs never become system copy even if imported flags claim otherwise', () => {
  setDictionary(english);
  const data = task();
  data.work.flow!.id = data.work.playbook!.id = 'custom-copy';
  expect(workTypeLabel(data.work)).toBe('技术修复 · 制定方案');
});

test('legacy canonical task detail follows mounted language changes without rewriting its snapshots', async () => {
  const data = task();
  delete data.work.flow!.system;
  delete data.work.flow!.edited;
  delete data.work.playbook!.system;
  delete data.work.playbook!.edited;
  const before = structuredClone(data);
  const runtime = await setup(data);
  expect(playbookCell()).toHaveTextContent('Technical fix');
  expect(document.querySelector('.nr-td-stepbar')).toHaveTextContent(
    'Review (you)Publish',
  );
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(playbookCell()).toHaveTextContent('技术修复');
  await act(() => runtime.changeLanguage('en-US'));
  expect(document.querySelector('.nr-td-stepbar')).toHaveTextContent(
    'Write plan',
  );
  expect(data).toEqual(before);
});

test('closed task labels and an open output reader refresh their canonical stage name', async () => {
  const data = task();
  data.work.results = [
    {
      id: 'artifact-1',
      stepId: 'plan',
      planVersion: 0,
      version: 1,
      content: '用户成果 {0}',
      createdAt: '2026-10-01T00:00:00Z',
      createdBy: 'root',
    },
  ];
  data.work.stageIndex = 1;
  data.work.history = [
    {
      at: '2026-10-01T00:00:00Z',
      action: 'runSucceeded',
      runId: 'run-1',
      artifactId: 'artifact-1',
    },
  ];
  const runtime = await setup(data);
  expect(closedWhen({ ...data.work, cancelledAt: '2026-10-02' })).toContain(
    'Review plan',
  );
  // Each delivered version opens from the activity line that records it.
  await userEvent
    .setup()
    .click(
      within(screen.getByRole('region', { name: 'Activity' })).getByRole(
        'button',
        { name: 'View' },
      ),
    );
  const dialog = screen.getByRole('dialog', { name: /Write plan/ });
  expect(dialog).toHaveTextContent('用户成果 {0}');
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(screen.getByRole('dialog', { name: /制定方案/ })).toBe(dialog);
  expect(dialog).toHaveTextContent('用户成果 {0}');
  expect(closedWhen({ ...data.work, cancelledAt: '2026-10-02' })).toContain(
    '审核方案',
  );
});

// Review and publish became Review on 2026-10-24, with Publish as the step after it.
test('snapshots stored with Review and publish show Review', () => {
  for (const legacy of [false, true]) {
    const data = task();
    for (const stage of data.work.flow!.stages)
      if (stage.kind === 'review' && stage.name === '审核')
        stage.name = '审核并发布';
    if (legacy) {
      delete data.work.flow!.system;
      delete data.work.flow!.edited;
      delete data.work.playbook!.system;
      delete data.work.playbook!.edited;
    }
    setDictionary(null);
    const chinese = localizeWorkSnapshots(data.work).flow!.stages.map(
      (s) => s.name,
    );
    expect(chinese).toContain('审核');
    expect(chinese).not.toContain('审核并发布');
    setDictionary(english);
    expect(
      localizeWorkSnapshots(data.work).flow!.stages.map((s) => s.name),
    ).toContain('Review');
    expect(data.work.flow!.stages.map((s) => s.name)).toContain('审核并发布');
  }
});

test('snapshots stored with the step names used before 2026-10-22 show the current wording', () => {
  const renamed: Record<string, string> = {
    制定方案: '出方案',
    审核方案: '看方案',
    审核: '看效果并发布',
  };
  for (const legacy of [false, true]) {
    const data = task();
    for (const stage of data.work.flow!.stages)
      stage.name = renamed[stage.name] ?? stage.name;
    expect(data.work.flow!.stages.map((s) => s.name)).toContain('出方案');
    if (legacy) {
      // Old snapshots carried no provenance; they are recognised by matching the canonical definition.
      delete data.work.flow!.system;
      delete data.work.flow!.edited;
      delete data.work.playbook!.system;
      delete data.work.playbook!.edited;
    }
    setDictionary(null);
    const chinese = localizeWorkSnapshots(data.work).flow!.stages.map(
      (s) => s.name,
    );
    expect(chinese).toContain('制定方案');
    expect(chinese).not.toContain('出方案');
    setDictionary(english);
    expect(
      localizeWorkSnapshots(data.work).flow!.stages.map((s) => s.name),
    ).toContain('Write plan');
    // Stored data is never rewritten.
    expect(data.work.flow!.stages.map((s) => s.name)).toContain('出方案');
  }
});
