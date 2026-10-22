import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { setDictionary } from '../../client/i18n';
import enUS from '../../client/locales/en-US';
import english from '../../shared/i18n/en.json';
import { GitHubConnect } from '../../client/pages/github-connect';
import { GoogleConnection } from '../../client/pages/google-connection';
import { KeywordConnection } from '../../client/pages/keyword-connection';
import { HealthPanel } from '../../client/pages/data-health';
import { ConnectionNetwork } from '../../client/components/connection-network';

const state = vi.hoisted(() => ({
  grants: [] as string[],
  action: vi.fn(),
  authorization: { can: vi.fn(), invalidate: vi.fn() },
  confirm: vi.fn(async () => true),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationClient: () => state.authorization,
  useAuthorizationRevision: () => state.grants.join(','),
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action: state.action, wrapRequests: () => {} },
}));
vi.mock('../../client/pages/workspace-cache', () => ({
  useWorkspaceCache: () => ({ invalidate: () => {} }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useUnsavedWarning: () => {},
}));
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: (ask: unknown) => state.confirm(ask),
}));
vi.mock('../../client/lib/toast', () => ({ toast: { success: () => {} } }));

const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
const github = {
  connected: true,
  repo: 'example/repo',
  url: 'https://example.test/repo',
  latest: { stars: 1, forks: 0, openIssues: 0 },
};
const profile = {
  id: 'mock-profile',
  name: 'Synthetic profile',
  kind: 'mock',
  url: '',
  username: '',
  hasPassword: false,
  revision: 1,
  references: 0,
  referenceDetails: [],
  updatedAt: '2026-10-17T00:00:00.000Z',
};
const clients: QueryClient[] = [];
beforeEach(() => {
  setDictionary(english);
  state.grants = [];
  state.authorization.can.mockReset();
  state.authorization.can.mockImplementation(async ({ resource, action }) =>
    state.grants.includes(`${action}@${resource.id}`),
  );
  state.action.mockReset();
  state.action.mockImplementation(async (resource: string, action: string) => {
    if (resource === 'nrGitHub') return github;
    if (resource === 'nrGoogle') {
      if (action === 'status')
        return {
          configured: true,
          authorized: true,
          connection: {
            accountEmail: 'example@example.test',
            ga4PropertyId: '123',
            gscSiteUrl: 'sc-domain:example.test',
          },
        };
      if (action === 'syncStatus')
        return { jobs: [], scheduleEnabled: false, coverage: [] };
    }
    if (resource === 'nrKeywords' && action === 'status')
      return { configured: true, verifiedAt: null, monthlyBudgetUsd: 5 };
    if (resource === 'nrKeywords' && action === 'spend')
      return {
        monthUsd: 0,
        totalUsd: 0,
        budgetUsd: 5,
        monthRuns: 0,
        totalRuns: 0,
        uncertain: 0,
      };
    if (resource === 'nrProxyProfiles') {
      if (action === 'capabilities')
        return { mockEnabled: true, scenarios: ['normal'] };
      if (action === 'list') return [profile];
      if (action === 'selections') return { github: profile.id };
      if (action === 'testConnection')
        return {
          reachable: true,
          status: 200,
          elapsedMs: 1,
          target: 'github',
          simulated: true,
        };
    }
    return {};
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  setDictionary(null);
});
function setup(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <TestI18nProvider runtime={runtime}>
      <QueryClientProvider client={client}>
        <MemoryRouter>{element}</MemoryRouter>
      </QueryClientProvider>
    </TestI18nProvider>,
  );
}

it('lets a GitHub sync-only role sync without credential or disconnect controls', async () => {
  state.grants = ['nrGitHub.sync@1'];
  setup(<GitHubConnect projectId={1} focus='repo' onChange={() => {}} />);
  const sync = await screen.findByRole('button', {
    name: 'Sync now',
    exact: true,
  });
  expect(screen.queryByLabelText('GitHub token')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Disconnect', exact: true }),
  ).toBeNull();
  await userEvent.click(sync);
  expect(state.action).toHaveBeenCalledWith(
    'nrGitHub',
    'sync',
    expect.objectContaining({ body: { projectId: 1 } }),
  );
});

it('keeps GitHub credential removal independent from replacement and synchronization', async () => {
  state.grants = ['nrGitHub.removeToken@1'];
  state.action.mockResolvedValue({
    ...github,
    token: { verifiedAt: '2026-10-17', error: null, since: null },
  });
  setup(<GitHubConnect projectId={1} focus='traffic' onChange={() => {}} />);
  const remove = await screen.findByRole('button', {
    name: 'Remove token',
    exact: true,
  });
  expect(screen.queryByLabelText('GitHub token')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Replace token', exact: true }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Sync now', exact: true }),
  ).toBeNull();
  await userEvent.click(remove);
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrGitHub',
      'removeToken',
      expect.objectContaining({ body: { projectId: 1 } }),
    ),
  );
});

it('lets a GitHub credential editor save a token without unrelated source actions', async () => {
  state.grants = ['nrGitHub.setToken@1'];
  setup(<GitHubConnect projectId={1} focus='traffic' onChange={() => {}} />);
  const token = await screen.findByLabelText('GitHub token');
  expect(
    screen.queryByRole('button', { name: 'Sync now', exact: true }),
  ).toBeNull();
  await userEvent.type(token, 'synthetic-token');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save and verify', exact: true }),
  );
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrGitHub',
      'setToken',
      expect.objectContaining({
        headers: { 'x-noreach-github-token': 'synthetic-token' },
      }),
    ),
  );
  expect(token).toHaveValue('');
});

it('keeps Google sync separate from OAuth, resource changes and schedule control', async () => {
  state.grants = ['nrGoogle.syncNow@1'];
  setup(<GoogleConnection projectId='1' />);
  const sync = await screen.findByRole('button', {
    name: 'Sync now',
    exact: true,
  });
  expect(screen.queryByLabelText('Google client secret')).toBeNull();
  expect(
    screen.queryByRole('button', {
      name: /Authorize Google|Disconnect|daily updates/i,
    }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Change resources', exact: true }),
  ).toBeNull();
  await waitFor(() => expect(sync).toBeEnabled());
  await userEvent.click(sync);
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrGoogle',
      'syncNow',
      expect.objectContaining({ body: { projectId: '1', days: 56 } }),
    ),
  );
});

it('lets a budget-only role change the project budget without editing or checking credentials', async () => {
  state.grants = ['nrKeywords.setBudget@1'];
  setup(<KeywordConnection projectId={1} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Change budget', exact: true }),
  );
  expect(screen.queryByLabelText('DataForSEO API Login')).toBeNull();
  expect(screen.queryByLabelText('DataForSEO API Password')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Verify connection', exact: true }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Disconnect', exact: true }),
  ).toBeNull();
  const dialog = screen.getByRole('dialog');
  const budget = within(dialog).getByRole('spinbutton');
  await userEvent.clear(budget);
  await userEvent.type(budget, '10');
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Save', exact: true }),
  );
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrKeywords',
      'setBudget',
      expect.objectContaining({
        body: { projectId: '1', monthlyBudgetUsd: 10 },
      }),
    ),
  );
});

it('lets a network tester test the current selection without changing it or all projects', async () => {
  state.grants = ['nrProxyProfiles.testConnection@1'];
  setup(<ConnectionNetwork projectId={1} source='github' />);
  const test = await screen.findByRole('button', {
    name: 'Test connection',
    exact: true,
  });
  expect(await screen.findByRole('combobox')).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Save', exact: true }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: /Apply.*all/i })).toBeNull();
  await waitFor(() => expect(test).toBeEnabled());
  await userEvent.click(test);
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrProxyProfiles',
      'testConnection',
      expect.objectContaining({
        body: { projectId: '1', connection: 'github' },
      }),
    ),
  );
});

it('keeps a project network selector separate from application-wide selection and tests', async () => {
  state.grants = ['nrProxyProfiles.select@1'];
  setup(<ConnectionNetwork projectId={1} source='github' />);
  await userEvent.click(await screen.findByRole('combobox'));
  await userEvent.click(
    await screen.findByRole('option', {
      name: 'Pause collection (no live requests)',
      exact: true,
    }),
  );
  expect(
    screen.queryByRole('button', { name: 'Test connection', exact: true }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: /Apply.*all/i })).toBeNull();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrProxyProfiles',
      'select',
      expect.objectContaining({
        body: { projectId: '1', connection: 'github', profileId: null },
      }),
    ),
  );
  expect(state.authorization.can).toHaveBeenCalledWith({
    resource: { type: 'nocoreach', id: '$app' },
    action: 'nrProxyProfiles.selectAll',
  });
});

it('checks each health retry against its actual project action', async () => {
  state.grants = ['nrGitHub.sync@1'];
  const request = state.action.getMockImplementation()!;
  state.action.mockImplementation(async (resource, action, input) => {
    if (resource === 'nrHealth')
      return {
        items: ['nrGitHub', 'nrPackages'].map((resource) => ({
          id: resource,
          name: resource,
          state: 'failing',
          message: 'Synthetic failure',
          lastSuccessAt: null,
          dataThrough: null,
          nextSyncAt: null,
          retry: { resource, action: 'sync', body: {} },
        })),
      };
    return request(resource, action, input);
  });
  setup(<HealthPanel projectId={1} reloadKey={0} onChange={() => {}} />);
  const retry = await screen.findByRole('button', {
    name: 'Retry',
    exact: true,
  });
  expect(
    screen.getAllByRole('button', { name: 'Retry', exact: true }),
  ).toHaveLength(1);
  await userEvent.click(retry);
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrGitHub',
      'sync',
      expect.objectContaining({ body: { projectId: 1 } }),
    ),
  );
  expect(
    state.action.mock.calls.some(
      ([resource, action]) => resource === 'nrPackages' && action === 'sync',
    ),
  ).toBe(false);
});

it('retries all only the plain retries the person may run, asks before an uncertain retry and opens settings', async () => {
  state.grants = ['nrGitHub.sync@1', 'nrRankTracking.check@1'];
  const request = state.action.getMockImplementation()!;
  const row = (
    id: string,
    resource: string,
    action: string,
    fix: string,
    body: object = {},
  ) => ({
    id,
    name: id,
    state: 'failing',
    message: 'Synthetic failure',
    lastSuccessAt: null,
    dataThrough: null,
    nextSyncAt: null,
    retry: { resource, action, body },
    fix,
  });
  state.action.mockImplementation(async (resource, action, input) => {
    if (resource === 'nrHealth')
      return {
        items: [
          row('github', 'nrGitHub', 'sync', 'retry'),
          row('packages', 'nrPackages', 'sync', 'retry'),
          row('rank', 'nrRankTracking', 'check', 'verify', {
            retryUncertain: true,
          }),
          row('competitors', 'nrCompetitors', 'check', 'settings'),
        ],
      };
    if (resource === 'nrRankTracking') return {};
    return request(resource, action, input);
  });
  const open = vi.fn();
  setup(
    <HealthPanel
      projectId={1}
      reloadKey={0}
      onChange={() => {}}
      settingsOf={(item) => (item.id === 'competitors' ? open : null)}
    />,
  );
  // Packages may not be retried by this person, so Retry all counts and runs GitHub only.
  await userEvent.click(
    await screen.findByRole('button', { name: 'Retry all (1)' }),
  );
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrGitHub',
      'sync',
      expect.objectContaining({ body: { projectId: 1 } }),
    ),
  );
  expect(await screen.findByText('Retry started')).toBeInTheDocument();
  expect(
    state.action.mock.calls.some(
      ([resource]) =>
        resource === 'nrPackages' || resource === 'nrRankTracking',
    ),
  ).toBe(false);
  // A configuration failure offers Change, which opens the source's settings.
  expect(
    screen.getByText(
      'Change the settings first; retrying won’t help until then.',
    ),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Change' }));
  expect(open).toHaveBeenCalled();
  // An uncertain DataForSEO result is retried only after the person confirms.
  await userEvent.click(
    screen.getByRole('button', { name: 'Check, then retry' }),
  );
  expect(state.confirm).toHaveBeenCalled();
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrRankTracking',
      'check',
      expect.objectContaining({
        body: { projectId: 1, retryUncertain: true },
      }),
    ),
  );
});
