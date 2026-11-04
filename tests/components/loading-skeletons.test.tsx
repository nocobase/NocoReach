import { NavigationGuardProvider } from '@nocobase/app-client';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import SourceConnections from '../../client/pages/source-connections';
import { HealthPanel } from '../../client/pages/data-health';
import { getCatalog } from '../../client/pages/data-sources';

// Data sources and Data health wait for their first read behind the shared skeleton (np-states), not a line of text.
const state = vi.hoisted(() => ({
  action: vi.fn(),
  sources: undefined as
    | undefined
    | { promise: Promise<unknown>; resolve: (value: unknown) => void },
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action: state.action, wrapRequests: () => {} },
  resolvePortalUrl: (path: string) => path,
  getPortalBase: () => '/',
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true, isPending: false }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<object>()),
  useCan: () => ({ can: false }),
}));
vi.mock('../../client/pages/workspace-cache', async (actual) => ({
  ...(await actual<object>()),
  useWorkspaceCache: () => ({ invalidate: vi.fn() }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({
    project: { id: 1, name: 'Example', domains: ['example.com'] },
  }),
}));
vi.mock('../../client/pages/discovery-box', () => ({
  DiscoveryBox: () => null,
}));
vi.mock('../../client/components/connection-network', () => ({
  ConnectionNetwork: () => null,
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: () => {},
}));

beforeEach(() => {
  setDictionary(english);
  let resolve: (value: unknown) => void = () => {};
  const promise = new Promise((done) => (resolve = done));
  state.sources = { promise, resolve };
  state.action.mockReset();
  state.action.mockImplementation(async (resource: string) => {
    if (resource === 'nrSources') return state.sources!.promise;
    if (resource === 'nrArticles') return { targets: [] };
    if (resource === 'nrHealth') return { checkedAt: '', items: [] };
    return {};
  });
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});

const page = () =>
  render(
    <MemoryRouter>
      <NavigationGuardProvider>
        <SourceConnections />
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
const available = () =>
  getCatalog().filter((source) => source.availability === 'available');

it('keeps each source card readable and shows skeletons for its state and action until the check is back', async () => {
  page();
  const region = screen.getByRole('status', {
    name: english['sourceConnections.checkingDataSources'],
  });
  expect(
    screen.queryByText(english['sourceConnections.checkingDataSources']),
  ).toBeNull();
  for (const source of available()) {
    const card = region.querySelector(`[data-source-id="${source.id}"]`)!;
    expect(within(card as HTMLElement).getByText(source.name)).toBeVisible();
    expect(card.querySelector('[data-slot="tag"]')).toBeNull();
    expect(card.querySelector('[data-state-skeleton]')).not.toBeNull();
    expect(card.querySelector('[data-action-skeleton]')).not.toBeNull();
    expect(card.querySelector('button')).toBeNull();
  }
  expect(screen.queryByText(english['dataSources.available'])).toBeNull();

  await act(async () => state.sources!.resolve({ sources: [] }));
  expect(
    screen.queryByRole('status', {
      name: english['sourceConnections.checkingDataSources'],
    }),
  ).toBeNull();
  for (const source of available()) {
    const card = document.querySelector(`[data-source-id="${source.id}"]`)!;
    expect(card.querySelector('[data-slot="tag"]')).not.toBeNull();
    expect(card.querySelector('[data-state-skeleton]')).toBeNull();
    expect(card.querySelector('[data-action-skeleton]')).toBeNull();
  }
});

it('shows the cards with the error and Retry when the first check fails, even after a drawer clears the error', async () => {
  state.action.mockImplementation(async (resource: string) => {
    if (resource === 'nrSources') throw new Error('offline');
    return {};
  });
  page();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    english['sourceConnections.notLoadDataSourceStatus'],
  );
  expect(
    screen.queryByRole('status', {
      name: english['sourceConnections.checkingDataSources'],
    }),
  ).toBeNull();
  expect(
    document.querySelector('[data-source-id="site"] [data-slot="tag"]'),
  ).not.toBeNull();
  // Opening a drawer clears the page's error; the cards keep their state instead of going back to skeletons.
  await userEvent.click(
    document.querySelector<HTMLElement>('[data-source-trigger="site"]')!,
  );
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(document.querySelector('[data-state-skeleton]')).toBeNull();
  expect(
    document.querySelector('[data-source-id="site"] [data-slot="tag"]'),
  ).not.toBeNull();
});

it('Data health shows a summary bar and the list skeleton while it reads, and its error as before', async () => {
  state.action.mockImplementation(() => new Promise(() => {}));
  const { unmount } = render(
    <MemoryRouter>
      <HealthPanel projectId={1} reloadKey={0} onChange={() => {}} />
    </MemoryRouter>,
  );
  const loading = screen.getByRole('status', {
    name: english['dataHealth.loadingDataHealth'],
  });
  expect(loading.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
  expect(screen.queryByText(english['common.loadingLoading'])).toBeNull();
  unmount();

  state.action.mockImplementation(async () => {
    throw new Error('offline');
  });
  render(
    <MemoryRouter>
      <HealthPanel projectId={1} reloadKey={0} onChange={() => {}} />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    english['dataHealth.notLoadDataHealth'],
  );
  expect(screen.queryByRole('status')).toBeNull();
});
