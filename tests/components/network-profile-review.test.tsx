import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import enUS from '../../client/locales/en-US';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import ProfilePage from '../../client/pages/proxy-profiles';
import { ConnectionNetwork } from '../../client/components/connection-network';
import {
  proxyRequest,
  type Profile,
} from '../../client/pages/proxy-profiles/api';

vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { role: 'admin' }, isAdmin: true }),
}));
vi.mock('../../client/pages/proxy-profiles/api', async (original) => ({
  ...(await original<object>()),
  proxyRequest: vi.fn(),
}));
vi.mock('../../client/pages/reach-data', () => ({
  loadProjects: vi.fn(async () => [{ id: 1, name: 'Review project' }]),
}));
vi.mock('../../client/pages/current-project', () => ({
  switchProject: vi.fn(),
}));

const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
const profile: Profile = {
  id: '86f2c028-4100-4d0e-989d-fd0b2233c58a',
  name: 'Review fixture',
  kind: 'mock',
  url: '',
  username: '',
  hasPassword: false,
  revision: 2,
  references: 0,
  referenceDetails: [],
  updatedAt: '2026-10-13T00:00:00Z',
  mock: { scenario: 'normal', seed: 'review', clock: '2026-10-13T00:00:00Z' },
};
const clients: QueryClient[] = [];
beforeEach(() => {
  setDictionary(english);
  vi.mocked(proxyRequest).mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  setDictionary(null);
});
function setup(network = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const router = createMemoryRouter([
    {
      path: '/',
      element: network ? (
        <ConnectionNetwork projectId='1' source='ga4' />
      ) : (
        <ProfilePage />
      ),
    },
  ]);
  render(
    <TestI18nProvider runtime={runtime}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TestI18nProvider>,
  );
}

it.each(['select', 'selectAll', 'testConnection'] as const)(
  'preserves the %s action and payload through repeated failures and retries',
  async (operation) => {
    let attempts = 0;
    let selections: Record<string, string> =
      operation === 'select' ? {} : { google: profile.id };
    vi.mocked(proxyRequest).mockImplementation(async (action) => {
      if (action === 'list') return [profile];
      if (action === 'capabilities')
        return { mockEnabled: true, scenarios: ['normal'] };
      if (action === 'selections') return selections;
      if (action === operation && ++attempts <= 2)
        throw new Error('Temporary failure');
      if (action === 'select' || action === 'selectAll') {
        selections = {
          google: profile.id,
          ...(action === 'selectAll' ? { github: profile.id } : {}),
        };
        return selections;
      }
      return {
        simulated: true,
        reachable: false,
        status: 0,
        elapsedMs: 0,
        target: 'google',
      };
    });
    const user = userEvent.setup();
    setup(true);
    await screen.findByRole('combobox');
    if (operation === 'select') {
      await user.click(screen.getByRole('combobox'));
      await user.click(
        await screen.findByRole('option', { name: /Review fixture/ }),
      );
    }
    const label =
      operation === 'selectAll'
        ? 'Apply to all project connections'
        : operation === 'select'
          ? 'Save'
          : 'Test connection';
    await user.click(screen.getByRole('button', { name: label, exact: true }));
    for (let failure = 0; failure < 2; failure++) {
      expect(await screen.findByText('Temporary failure')).toBeVisible();
      await user.click(
        screen.getByRole('button', { name: 'Retry', exact: true }),
      );
    }
    await waitFor(() => expect(attempts).toBe(3));
    await waitFor(() =>
      expect(screen.queryByText('Temporary failure')).not.toBeInTheDocument(),
    );
    const payload =
      operation === 'testConnection'
        ? { projectId: '1', connection: 'google' }
        : { projectId: '1', connection: 'google', profileId: profile.id };
    expect(
      vi
        .mocked(proxyRequest)
        .mock.calls.filter(([action]) =>
          ['select', 'selectAll', 'testConnection'].includes(action),
        ),
    ).toEqual(Array.from({ length: 3 }, () => [operation, payload]));
    if (operation === 'selectAll')
      expect(selections).toEqual({ google: profile.id, github: profile.id });
  },
);

const scenarios = [
  ['normal', 'Normal data', '正常数据'],
  ['newdata', 'New data', '新增数据'],
  ['empty', 'Empty data', '空数据'],
  ['pagination', 'Pagination', '分页数据'],
  ['rate-limit', 'Rate limit', '限流'],
  ['login-expired', 'Expired authorization', '授权过期'],
  ['timeout', 'Timeout', '超时'],
  ['malformed', 'Malformed response', '格式错误'],
  ['error', 'Upstream error', '上游错误'],
  ['slow-cancel', 'Delay and cancellation', '延迟与取消'],
] as const;
it.each(['en', 'zh'] as const)(
  'renders every persisted scenario in the profile list in %s',
  async (language) => {
    setDictionary(language === 'en' ? english : null);
    const profiles: Profile[] = scenarios.map(([scenario], index) => ({
      ...profile,
      id: String(index),
      name: `Fixture ${scenario}`,
      mock: { scenario, seed: 'review', clock: '2026-10-13T00:00:00Z' },
    }));
    vi.mocked(proxyRequest).mockResolvedValue(profiles);
    setup();
    await screen.findByRole('table');
    for (const [scenario, en, zh] of scenarios) {
      expect(screen.getByText(`Fixture ${scenario}`)).toBeVisible();
      expect(
        screen.getByText(
          `${language === 'en' ? 'Simulated responses' : '模拟响应'} · ${language === 'en' ? en : zh}`,
        ),
      ).toBeVisible();
    }
    expect(
      screen.queryByText(/networkProfiles\.scenarios\./),
    ).not.toBeInTheDocument();
    expect(profiles.map((item) => item.mock?.scenario)).toEqual(
      scenarios.map(([scenario]) => scenario),
    );
  },
);

it('uses network profile terminology for the English empty state', async () => {
  vi.mocked(proxyRequest).mockResolvedValue([]);
  setup();
  expect(await screen.findByText('No network profiles yet')).toBeVisible();
});
it('uses network profile terminology for the English limit', async () => {
  vi.mocked(proxyRequest).mockResolvedValue(
    Array.from({ length: 50 }, (_, index) => ({
      ...profile,
      id: String(index),
    })),
  );
  setup();
  expect(
    await screen.findByText('You can add up to 50 network profiles'),
  ).toBeVisible();
});
it('uses network profile terminology for deleting a simulated profile', async () => {
  vi.mocked(proxyRequest).mockResolvedValue([profile]);
  const user = userEvent.setup();
  setup();
  await user.click(
    await screen.findByRole('button', { name: `Actions ${profile.name}` }),
  );
  await user.click(
    await screen.findByRole('menuitem', { name: 'Delete', exact: true }),
  );
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(
    `Delete network profile「${profile.name}」`,
  );
});
it('uses network profile terminology for the management link and missing selection', async () => {
  vi.mocked(proxyRequest).mockImplementation(async (action) => {
    if (action === 'list') return [profile];
    if (action === 'capabilities')
      return { mockEnabled: true, scenarios: ['normal'] };
    return { google: 'removed-profile' };
  });
  setup(true);
  expect(
    await screen.findByRole('link', { name: 'Manage network profiles' }),
  ).toBeVisible();
  expect(screen.getByRole('combobox')).toHaveTextContent(
    'Network profile not found',
  );
});
