import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import {
  newDiscoveryRule,
  type DiscoveryStatus,
  type DiscoveredRepository,
} from '../../shared/github-discovery';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api';
import { GitHubDiscoveryConnect } from '../../client/pages/github-discovery/connect';
import { DiscoveryResults } from '../../client/pages/github-discovery/results';
import RuleEditor from '../../client/pages/github-discovery/rule-editor';
import {
  formOf,
  parseForm,
} from '../../client/pages/github-discovery/rule-form';

const state = vi.hoisted(() => ({ action: vi.fn(), can: true }));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<object>()),
  nocobaseClient: { action: state.action, wrapRequests: vi.fn() },
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: state.can, loading: false }),
}));
vi.mock('@nocobase/app-client', () => ({
  usePageBreadcrumb: vi.fn(),
  useNavigationGuard: vi.fn(),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 7 } }),
}));
vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: vi.fn(async () => true),
}));
const status = (): DiscoveryStatus => ({
  revision: 1,
  credential: 'shared',
  connected: true,
  running: false,
  rules: [{ ...newDiscoveryRule(true), id: 'rule1' }],
  savedCount: 0,
  lastRun: null,
  lastSuccessAt: null,
  nextScanAt: null,
  capped: false,
});
const repository: DiscoveredRepository = {
  id: '123',
  name: 'team/support-desk',
  url: 'https://github.com/team/support-desk',
  description: '',
  stars: 42,
  createdAt: '2026-10-01T00:00:00Z',
  pushedAt: null,
  license: null,
  fork: false,
  archived: false,
  template: false,
  firstDiscoveredAt: '2026-10-28T00:00:00Z',
  checkedAt: '2026-10-28T00:00:00Z',
  matches: [
    {
      ruleId: 'rule1',
      commit: 'a'.repeat(40),
      base: '',
      checkedAt: '2026-10-28T00:00:00Z',
      status: 'verified',
      evidence: [],
    },
  ],
  review: 'unreviewed',
  favorite: false,
  revision: 1,
};
function mount(element: React.ReactNode, path = '/data/github?view=discovery') {
  const router = createMemoryRouter(
    [
      { path: '/data/github', element },
      { path: '/connections/discovery/:ruleId', element },
      { path: '/connections', element: <div>Connections returned</div> },
    ],
    { initialEntries: [path] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  setDictionary(english);
  state.can = true;
  state.action.mockReset();
  state.action.mockImplementation(async (_resource: string, action: string) => {
    if (action === 'status') return status();
    if (action === 'list')
      return {
        items: [repository],
        total: 1,
        storedTotal: 1,
        page: 1,
        pageSize: 20,
        capped: false,
      };
    throw new Error(`Unexpected ${action}`);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('offers the preset without requiring a Traffic connection and hides writes for readers', async () => {
  state.can = false;
  mount(
    <GitHubDiscoveryConnect
      projectId={7}
      onChange={vi.fn()}
      onSavingChange={vi.fn()}
    />,
  );
  expect(
    await screen.findByText(english['githubDiscovery.credentialShared']),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', {
      name: english['githubDiscovery.usePreset'],
    }),
  ).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(
    state.action.mock.calls.every(
      ([resource]) => resource === 'nrGitHubDiscovery',
    ),
  ).toBe(true);
});
it('edits the NocoBase preset, validates fields locally, and keeps the draft when saving conflicts', async () => {
  const user = userEvent.setup();
  state.action.mockImplementation(async (_r: string, action: string) => {
    if (action === 'status') return status();
    throw new NocoReachHttpError('Changed remotely', 409, null);
  });
  mount(
    <RuleEditor />,
    '/connections/discovery/new?source=github-discovery&preset=nocobase3',
  );
  const name = await screen.findByRole('textbox', { name: 'Name *' });
  await user.clear(name);
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(name).toHaveFocus());
  expect(name).toHaveAttribute('aria-invalid', 'true');
  expect(state.action.mock.calls.some(([, a]) => a === 'saveRule')).toBe(false);
  await user.type(name, 'My framework');
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(await screen.findByText('Changed remotely')).toBeVisible();
  expect(name).toHaveValue('My framework');
  expect(state.action).toHaveBeenCalledWith(
    'nrGitHubDiscovery',
    'saveRule',
    expect.objectContaining({
      body: expect.objectContaining({
        projectId: 7,
        revision: 1,
        rule: expect.objectContaining({ name: 'My framework' }),
      }),
    }),
  );
});
it('saves the edited preset and returns to the discovery connection', async () => {
  const user = userEvent.setup();
  state.action.mockResolvedValue(status());
  const { router } = mount(
    <RuleEditor />,
    '/connections/discovery/new?source=github-discovery&preset=nocobase3',
  );
  await screen.findByDisplayValue('NocoBase 3');
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await screen.findByText('Connections returned');
  expect(router.state.location.search).toBe('?source=github-discovery');
});
it('keeps search typing local, preserves composition, and serializes filters and stable detail URLs', async () => {
  const user = userEvent.setup();
  const { router } = mount(
    <DiscoveryResults projectId={7} />,
    '/data/github?view=discovery&status=verified&rule=rule1',
  );
  const link = await screen.findByRole('link', { name: repository.name });
  expect(link).toHaveAttribute(
    'href',
    '/data/github/discovery/123?view=discovery&status=verified&rule=rule1',
  );
  expect(
    screen.getAllByText(english['githubDiscovery.verified']).length,
  ).toBeGreaterThan(0);
  const input = screen.getByRole('textbox', {
    name: english['githubDiscovery.search'],
  });
  const calls = state.action.mock.calls.length;
  await user.type(input, 'help');
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'help应用' } });
  fireEvent.compositionEnd(input, { data: '应用' });
  expect(input).toHaveValue('help应用');
  expect(state.action.mock.calls.length).toBe(calls);
  await user.click(
    screen.getByRole('button', {
      name: english['githubDiscovery.searchButton'],
    }),
  );
  await waitFor(() =>
    expect(
      new URLSearchParams(router.state.location.search).get('search'),
    ).toBe('help应用'),
  );
  expect(state.action).toHaveBeenLastCalledWith(
    'nrGitHubDiscovery',
    'list',
    expect.objectContaining({
      body: expect.objectContaining({
        search: 'help应用',
        sort: 'checkedAt',
        order: 'desc',
        status: 'verified',
        ruleId: 'rule1',
        page: 1,
      }),
    }),
  );
});
it('does not retry forbidden records or show a missing rule as editable', async () => {
  state.action.mockResolvedValue({ ...status(), rules: [] });
  mount(
    <RuleEditor />,
    '/connections/discovery/deleted?source=github-discovery',
  );
  expect(
    await screen.findByText(english['githubDiscovery.missing']),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
});
it('round-trips version unions and rejects malformed dependency and JSON conditions', () => {
  const rule = newDiscoveryRule(true),
    form = formOf(rule);
  form.dependencies = 'sdk | ^3 || ^4';
  expect(parseForm(form, rule).rule?.dependencies[0]?.range).toBe('^3||^4');
  form.dependencies = 'sdk | ^3 | junk';
  expect(parseForm(form, rule).invalid).toContain('dependencies');
  form.dependencies = 'sdk | ^3';
  form.json = 'package.json | __proto__.name | x';
  expect(parseForm(form, rule).invalid).toContain('json');
});

it('recovers the editor after an initial request failure', async () => {
  const user = userEvent.setup();
  state.action
    .mockRejectedValueOnce(
      new NocoReachHttpError('Temporary failure', 502, null),
    )
    .mockResolvedValue(status());
  mount(
    <RuleEditor />,
    '/connections/discovery/new?source=github-discovery&preset=nocobase3',
  );
  await user.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(await screen.findByDisplayValue('NocoBase 3')).toBeVisible();
  expect(screen.queryByText('Temporary failure')).toBeNull();
});
it('submits credentials in the dedicated header and clears them only after success', async () => {
  const user = userEvent.setup();
  state.action.mockResolvedValue(status());
  mount(
    <GitHubDiscoveryConnect
      projectId={7}
      onChange={vi.fn()}
      onSavingChange={vi.fn()}
    />,
  );
  const input = await screen.findByLabelText('GitHub credential *');
  await user.type(input, 'ghp_fakeTokenUsedOnlyForThisComponentTest');
  await user.click(
    screen.getByRole('button', { name: english['github.saveVerify'] }),
  );
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrGitHubDiscovery',
      'setToken',
      expect.objectContaining({
        headers: {
          'x-nocoreach-discovery-token':
            'ghp_fakeTokenUsedOnlyForThisComponentTest',
        },
        body: { projectId: 7, revision: 1 },
      }),
    ),
  );
  expect(input).toHaveValue('');
});

it('refreshes saved results when all discovery rules are paused', async () => {
  const user = userEvent.setup();
  state.action.mockImplementation(async (_r: string, action: string) =>
    action === 'status'
      ? {
          ...status(),
          rules: status().rules.map((r) => ({ ...r, enabled: false })),
        }
      : {
          items: [repository],
          total: 1,
          storedTotal: 1,
          page: 1,
          pageSize: 20,
          capped: false,
        },
  );
  mount(<DiscoveryResults projectId={7} />);
  await screen.findByRole('link', { name: repository.name });
  await user.click(
    screen.getByRole('button', { name: 'Refresh', exact: true }),
  );
  await waitFor(() =>
    expect(state.action.mock.calls.filter(([, a]) => a === 'list').length).toBe(
      2,
    ),
  );
  expect(state.action.mock.calls.some(([, a]) => a === 'scan')).toBe(false);
});

it('shows a failed poll beside saved rules and resumes polling after Retry', async () => {
  const user = userEvent.setup();
  let calls = 0;
  state.action.mockImplementation(async () => {
    calls++;
    if (calls === 2)
      throw new NocoReachHttpError('Polling interrupted', 502, null);
    return { ...status(), running: calls === 1 };
  });
  mount(
    <GitHubDiscoveryConnect
      projectId={7}
      onChange={vi.fn()}
      onSavingChange={vi.fn()}
    />,
  );
  expect(await screen.findByText('NocoBase 3')).toBeVisible();
  expect(
    await screen.findByText('Polling interrupted', {}, { timeout: 4000 }),
  ).toBeVisible();
  expect(screen.getByText('NocoBase 3')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(screen.queryByText('Polling interrupted')).toBeNull(),
  );
  expect(calls).toBe(3);
});
it('returns focus to Add rule after removing a rule', async () => {
  const user = userEvent.setup();
  let removed = false;
  state.action.mockImplementation(async (_r: string, action: string) => {
    if (action === 'removeRule') removed = true;
    return { ...status(), rules: removed ? [] : status().rules };
  });
  mount(
    <GitHubDiscoveryConnect
      projectId={7}
      onChange={vi.fn()}
      onSavingChange={vi.fn()}
    />,
  );
  await user.click(
    await screen.findByRole('button', {
      name: english['common.moreActions'].replace('{0}', 'NocoBase 3'),
    }),
  );
  await user.click(await screen.findByRole('menuitem', { name: 'Remove' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: english['githubDiscovery.addRule'] }),
    ).toHaveFocus(),
  );
  expect(screen.queryByText('NocoBase 3')).toBeNull();
});
