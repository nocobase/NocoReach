import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import {
  $t,
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import OptimizationWork from '../../client/pages/optimization-work';
import type { Work } from '../../client/pages/task-execution-types';
import {
  playbookFilterOptions,
  playbookFilterValue,
} from '../../client/pages/task-playbook-filter';
import { SYSTEM_PLAYBOOKS, stagesFor } from '../../shared/playbook-catalog';

type Task = {
  id: number;
  title: string;
  brief: string;
  status: string;
  updatedAt: string;
  evidence: { work?: Work };
};
const { fixture, taskRecords } = vi.hoisted(() => ({
  fixture: { tasks: [] as Task[] },
  taskRecords: vi.fn<() => Promise<Task[]>>(),
}));
vi.mock('../../client/pages/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/pages/me')>()),
  useMe: () => ({
    me: { id: 'root' },
    isAdmin: true,
    can: () => true,
    mine: () => true,
  }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'Example' } }),
  taskRecords,
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { wrapRequests: () => {}, action: vi.fn(async () => []) },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  useRunnerOptions: () => ({ options: [], loading: false, online: 0 }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));
let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
  localStorage.clear();
  vi.clearAllMocks();
});

function task(
  id: number,
  origin: 'custom' | 'edited' | 'system' | 'legacy',
  name = '技术修复',
  version = 3,
): Task {
  const p = SYSTEM_PLAYBOOKS.find((p) => p.id === 'tech-fix');
  if (!p) throw new Error('Missing built-in fixture');
  const flags =
    origin === 'legacy'
      ? {}
      : { system: origin !== 'custom', edited: origin === 'edited' };
  const playbookId = origin === 'custom' ? `custom-${id}` : p.id;
  return {
    id,
    title: `Task ${id}`,
    brief: '',
    status: 'open',
    updatedAt: '2026-10-10',
    evidence: {
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
          id: playbookId,
          name,
          kind: p.kind,
          version,
          next: [...p.next],
          ...flags,
        },
        flow: {
          id: playbookId,
          name,
          version,
          stages: structuredClone(stagesFor(p)),
          ...flags,
        },
      },
    },
  };
}

async function setup(
  tasks: Task[],
  locale: 'en-US' | 'zh-CN' = 'en-US',
  query = '',
  searchGate?: Promise<void>,
) {
  fixture.tasks = tasks;
  taskRecords.mockImplementation(async () => fixture.tasks);
  const runtime = new I18nRuntime({
    defaultLocale: locale,
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  let searchReady = !searchGate;
  void searchGate?.then(() => {
    searchReady = true;
  });
  function SearchGate() {
    const location = useLocation();
    if (!searchReady && new URLSearchParams(location.search).has('q'))
      throw searchGate;
    return null;
  }
  function Page() {
    useNocoReachLocale();
    const location = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <output data-testid='query'>{location.search}</output>
        <button onClick={() => navigate(-1)}>Test back</button>
        <button onClick={() => navigate(1)}>Test forward</button>
        <OptimizationWork />
      </>
    );
  }
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={[`/actions${query}`]}>
        <Suspense fallback={<p>Transition pending</p>}>
          <Page />
          <SearchGate />
        </Suspense>
      </MemoryRouter>
    </I18nProvider>,
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('status', { name: $t('common.loadingTasks') }),
    ).not.toBeInTheDocument(),
  );
  return runtime;
}
const select = () =>
  screen.getByRole('combobox', { name: $t('optimizationWork.filterPlaybook') });
const query = () =>
  new URLSearchParams(screen.getByTestId('query').textContent ?? '');
const visible = (id: number) =>
  expect(screen.getByText(`Task ${id}`)).toBeInTheDocument();
const absent = (id: number) =>
  expect(screen.queryByText(`Task ${id}`)).not.toBeInTheDocument();
// The filters are the application's Select: its options render in a popup once the trigger is opened, and the chosen
// value is on the trigger's data-value.
async function choose(name: string) {
  const user = userEvent.setup();
  await user.click(select());
  await user.click(await screen.findByRole('option', { name }));
}
async function options() {
  const user = userEvent.setup();
  await user.click(select());
  const list = await screen.findAllByRole('option');
  const names = list.map((option) => option.textContent);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('option')).toBeNull());
  return names;
}

test.each(['custom', 'edited'] as const)(
  '%s snapshot keeps user name in the filter',
  async (origin) => {
    const runtime = await setup([task(1, origin)]);
    await choose('技术修复');
    visible(1);
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(await options()).toContain('技术修复');
    visible(1);
  },
);

test('selected canonical name survives both locale switches without refetch or URL changes', async () => {
  const runtime = await setup(
    [task(1, 'system'), task(2, 'custom', 'Other')],
    'zh-CN',
  );
  await choose('技术修复');
  const selectedQuery = query().toString();
  expect(query().get('playbookName')).toBe('技术修复');
  expect(query().has('playbook')).toBe(false);
  for (const locale of ['en-US', 'zh-CN'] as const) {
    await act(() => runtime.changeLanguage(locale));
    visible(1);
    absent(2);
    expect(select()).toHaveAttribute('data-value', playbookFilterValue('技术修复'));
    expect(query().toString()).toBe(selectedQuery);
  }
  expect(taskRecords).toHaveBeenCalledTimes(1);
});

test('same raw name spans IDs, versions and origins while retaining each display wording', async () => {
  const tasks = [
    task(1, 'system'),
    task(2, 'edited', '技术修复', 4),
    task(3, 'custom'),
    task(4, 'custom', '技术修复', 9),
    task(5, 'legacy'),
    task(6, 'custom', 'Other'),
  ];
  const raw = structuredClone(tasks);
  const runtime = await setup(tasks);
  await choose('Technical fix / 技术修复');
  for (const id of [1, 2, 3, 4, 5]) visible(id);
  absent(6);
  expect(await options()).toHaveLength(3);
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(await options()).toContain('技术修复');
  for (const id of [1, 2, 3, 4, 5]) visible(id);
  expect(tasks).toEqual(raw);
});

test('equal English display labels do not merge different raw names', async () => {
  const runtime = await setup([
    task(1, 'system'),
    task(2, 'custom', 'Technical fix'),
  ]);
  await choose('Technical fix (技术修复)');
  visible(1);
  absent(2);
  await choose('Technical fix (Technical fix)');
  absent(1);
  visible(2);
  await act(() => runtime.changeLanguage('zh-CN'));
  absent(1);
  visible(2);
  expect(query().get('playbookName')).toBe('Technical fix');
});

test.each(['技术修复', 'Technical fix'])(
  'legacy name query %s keeps its matching set across locales',
  async (name) => {
    const initial = new URLSearchParams({
      playbook: name,
      q: 'Task',
      owner: '',
      view: 'list',
    });
    const runtime = await setup(
      [
        task(1, 'system'),
        task(2, 'edited'),
        task(3, 'custom', 'Technical fix'),
      ],
      'zh-CN',
      `?${initial}`,
    );
    for (const locale of ['zh-CN', 'en-US', 'zh-CN'] as const) {
      await act(() => runtime.changeLanguage(locale));
      visible(1);
      visible(2);
      if (name === 'Technical fix') visible(3);
      else absent(3);
      expect(query().toString()).toBe(initial.toString());
      expect(select()).toHaveAttribute('data-value', playbookFilterValue(name, true));
    }
    await choose($t('optimizationWork.playbooks'));
    expect(query().has('playbook')).toBe(false);
    expect(query().has('playbookName')).toBe(false);
    expect(query().get('q')).toBe('Task');
    visible(1);
    visible(2);
    visible(3);
  },
);

test.each([
  '["legacy","技术修复"]',
  '["name","技术修复"]',
  '任意 名字 {0}&+=?/%',
  '__proto__',
  'constructor',
])(
  'raw name %s round trips without tag, dictionary or URL collisions',
  async (name) => {
    const runtime = await setup([task(1, 'custom', name), task(2, 'system')]);
    await choose(name);
    expect(query().get('playbookName')).toBe(name);
    visible(1);
    absent(2);
    await act(() => runtime.changeLanguage('zh-CN'));
    visible(1);
    absent(2);
    expect(select()).toHaveAttribute('data-value', playbookFilterValue(name));
  },
);

test('raw name parameter wins over an old alias, including an explicit empty value', async () => {
  await setup(
    [task(1, 'system'), task(2, 'custom', 'Technical fix')],
    'en-US',
    '?playbook=Technical+fix&playbookName=Technical+fix',
  );
  absent(1);
  visible(2);
  await choose($t('optimizationWork.playbooks'));
  expect(query().toString()).toBe('');
  visible(1);
  visible(2);
  cleanup();
  disconnect?.();
  await setup(
    [task(1, 'system'), task(2, 'custom', 'Other')],
    'en-US',
    '?playbook=Technical+fix&playbookName=',
  );
  visible(1);
  visible(2);
  expect(select()).toHaveAttribute('data-value', '');
});

test('empty or missing names have no filter option and remain in the unfiltered list', async () => {
  const missing = task(2, 'custom');
  delete missing.evidence.work;
  await setup([task(1, 'custom', ''), missing]);
  expect(await options()).toHaveLength(1);
  visible(1);
  visible(2);
});

test('legacy canonical localization and altered legacy raw names use the same display helper', async () => {
  const changed = task(2, 'legacy', '技术修复 {0}', 2);
  await setup([task(1, 'legacy'), changed]);
  expect(await options()).toContain('Technical fix');
  await choose('技术修复 {0}');
  absent(1);
  visible(2);
});

test('unknown legacy query stays unmatched and can be cleared', async () => {
  await setup([task(1, 'system')], 'en-US', '?playbook=unknown%7B0%7D');
  absent(1);
  expect(
    screen.getByText('No matching tasks. Try adjusting the filters.'),
  ).toBeInTheDocument();
  expect(await options()).toContain('unknown{0}');
  await choose('All playbooks');
  visible(1);
});

test('DOM option identities are independent of labels and raw-name ordering', () => {
  const works = [
    task(1, 'custom', '["legacy","技术修复"]').evidence.work,
    task(2, 'custom', '技术修复').evidence.work,
  ];
  const before = playbookFilterOptions(works);
  expect(new Set(before.map((option) => option.value)).size).toBe(2);
  expect(before.map((option) => option.value)).not.toContain(
    playbookFilterValue('技术修复', true),
  );
  expect(playbookFilterOptions([...works].reverse())).toEqual(before);
});

test('rapid view and filter changes compose before the router commits', async () => {
  await setup(
    [task(1, 'system'), task(2, 'custom', 'Other')],
    'en-US',
    '?view=board&playbook=Technical+fix&keep=1&status=doing',
  );
  // The view changes and the filter is picked right after, before the router has settled.
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'List', exact: true }));
  });
  await choose('Other');
  await waitFor(() => expect(query().get('playbookName')).toBe('Other'));
  expect(
    screen.getByRole('button', { name: 'List', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(query().get('view')).toBeNull();
  expect(query().has('playbook')).toBe(false);
  expect(query().get('keep')).toBe('1');
  // There is no status filter any more; an old ?status= link filters nothing.
  expect(
    screen.queryByRole('combobox', { name: 'Filter by status' }),
  ).toBeNull();
  visible(2);
  absent(1);
});

test('rapid filter then view changes retain the last value of each parameter', async () => {
  await setup([task(1, 'system'), task(2, 'custom', 'Other')]);
  await choose('Technical fix');
  await choose('Other');
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Board', exact: true }));
  });
  await waitFor(() => expect(query().get('view')).toBe('board'));
  expect(query().get('playbookName')).toBe('Other');
  expect(query().get('view')).toBe('board');
  visible(2);
  absent(1);
});

test('back and forward replace pending parameters before the next edit', async () => {
  await setup(
    [task(1, 'system'), task(2, 'custom', 'Other')],
    'en-US',
    '?keep=1',
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Board', exact: true }));
  await choose('Other');
  await user.click(screen.getByRole('button', { name: 'Test back' }));
  expect(query().get('playbookName')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Test forward' }));
  expect(query().get('playbookName')).toBe('Other');
  await user.click(screen.getByRole('button', { name: 'Test back' }));
  await user.click(screen.getByRole('button', { name: 'List', exact: true }));
  expect(query().get('view')).toBeNull();
  expect(query().get('playbookName')).toBeNull();
  expect(query().get('keep')).toBe('1');
  visible(1);
  visible(2);
});

test('character input remains complete while filter transitions are pending', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await setup(
    [task(1, 'system'), task(2, 'custom', 'Other')],
    'en-US',
    '',
    gate,
  );
  const input = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'Search tasks',
  });
  try {
    await choose('Other');
    // A real suspended router transition retains the old URL between key events.
    // Filling the final word in one change would conceal the controlled reset.
    await userEvent.setup().type(input, 'Review');
    expect(input).toHaveValue('Review');
  } finally {
    await act(async () => {
      release();
      await gate;
    });
  }
  await waitFor(() => expect(query().get('q')).toBe('Review'));
  expect(query().get('playbookName')).toBe('Other');
});

test('a pending search merges later view and filter changes', async () => {
  const runtime = await setup(
    [task(1, 'system'), task(2, 'custom', 'Other')],
    'en-US',
    '?keep=1',
  );
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Search tasks' }),
    'Review',
  );
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(screen.getByRole('textbox', { name: '搜索任务' })).toHaveValue(
    'Review',
  );
  await act(() => runtime.changeLanguage('en-US'));
  await choose('Other');
  await user.click(screen.getByRole('button', { name: 'Board', exact: true }));
  await waitFor(() => expect(query().get('q')).toBe('Review'));
  expect(query().get('playbookName')).toBe('Other');
  expect(query().get('view')).toBe('board');
  expect(query().get('keep')).toBe('1');
});

test('composition keeps draft text out of the URL until confirmation', async () => {
  const runtime = await setup([task(1, 'system')]);
  const input = screen.getByRole('textbox', { name: 'Search tasks' });
  fireEvent.change(input, { target: { value: 'prefix' } });
  fireEvent.compositionStart(input);
  fireEvent.input(input, { target: { value: 'zhongwen' }, isComposing: true });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(query().get('q')).toBeNull();
  expect(input).toHaveValue('zhongwen');
  fireEvent.compositionEnd(input, { target: { value: '中文 {0}' } });
  await waitFor(() => expect(query().get('q')).toBe('中文 {0}'));
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(input).toHaveValue('中文 {0}');
});

test('back and forward restore search text and cancel a pending write', async () => {
  await setup([task(1, 'system')], 'en-US', '?q=Task&keep=1');
  const user = userEvent.setup();
  const input = screen.getByRole('textbox', { name: 'Search tasks' });
  await user.click(screen.getByRole('button', { name: 'Board', exact: true }));
  await user.clear(input);
  await user.type(input, 'Review');
  await waitFor(() => expect(query().get('q')).toBe('Review'));
  await user.click(screen.getByRole('button', { name: 'Test back' }));
  expect(input).toHaveValue('Task');
  await user.click(screen.getByRole('button', { name: 'Test forward' }));
  expect(input).toHaveValue('Review');
  await user.clear(input);
  await user.type(input, 'pending');
  await user.click(screen.getByRole('button', { name: 'Test back' }));
  expect(input).toHaveValue('Task');
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(query().get('q')).toBe('Task');
  expect(query().get('keep')).toBe('1');
});

test('a delayed own URL write does not erase characters typed after it', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await setup([task(1, 'system')], 'en-US', '', gate);
  const input = screen.getByRole('textbox', { name: 'Search tasks' });
  const user = userEvent.setup();
  try {
    await user.type(input, 'R');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    await user.type(input, 'eview');
    expect(input).toHaveValue('Review');
  } finally {
    await act(async () => {
      release();
      await gate;
    });
  }
  expect(input).toHaveValue('Review');
  await waitFor(() => expect(query().get('q')).toBe('Review'));
});

test.each([
  ['back', ''],
  ['forward', ''],
  ['back', 'Task'],
  ['forward', 'Task'],
] as const)(
  '%s cancels pending input between history entries with the same q=%s',
  async (direction, search) => {
    await setup(
      [task(1, 'system')],
      'en-US',
      `?view=list&keep=history${search ? `&q=${search}` : ''}`,
    );
    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: 'Search tasks' });
    await user.click(
      screen.getByRole('button', { name: 'Board', exact: true }),
    );
    if (direction === 'forward')
      await user.click(screen.getByRole('button', { name: 'Test back' }));
    await user.clear(input);
    await user.type(input, 'Review');
    await user.click(
      screen.getByRole('button', {
        name: direction === 'back' ? 'Test back' : 'Test forward',
      }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(input).toHaveValue(search);
    expect(query().get('q')).toBe(search || null);
    expect(query().get('view')).toBe(direction === 'back' ? 'list' : 'board');
    expect(query().get('keep')).toBe('history');
  },
);

test('Runner-only tasks no longer offer an online executor filter', async () => {
  await setup([task(1, 'system')], 'en-US');
  expect(
    screen.queryByRole('combobox', {
      name: $t('optimizationWork.filterExecutor'),
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('combobox', {
      name: $t('optimizationWork.filterPlaybook'),
    }),
  ).toBeVisible();
});
