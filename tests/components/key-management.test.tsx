import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { setDictionary } from '../../client/i18n';
import enUS from '../../client/locales/en-US';
import dictionary from '../../shared/i18n/en.json';
import Keys from '../../client/pages/access/keys';
import KeyForm from '../../client/pages/access/key-form';
import KeyHistory from '../../client/pages/access/key-history';
const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<object>()),
  useApiClient: () => state,
}));
vi.mock('@nocobase/app-plugin-authentication/client', async (original) => ({
  ...(await original<object>()),
  useAuthentication: () => ({
    session: { user: { id: 'self' }, session: { id: 'session' } },
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<object>()),
  useAuthorizationRevision: () => 'revision',
}));
const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
beforeEach(() => {
  setDictionary(dictionary);
  state.request.mockReset();
  state.request.mockImplementation(
    async ({ path, method }: { path: string; method: string }) => {
      if (path.startsWith('nocoreachKeys/list'))
        return { data: { items: [], canManage: false } };
      if (path === 'nocoreachKeys/options')
        return {
          data: {
            levels: ['read'],
            projects: [{ id: '1', name: 'My project', levels: ['read'] }],
            roles: [],
          },
        };
      if (method === 'POST')
        return { data: { key: { id: 'new' }, secret: 'synthetic-once-only' } };
      return { data: [] };
    },
  );
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});
function setup(path: string) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <Outlet />,
        children: [
          {
            path: '/keys',
            element: <Keys />,
            children: [
              { path: 'new', element: <KeyForm /> },
              { path: ':ownerId/:keyId', element: <KeyHistory /> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <TestI18nProvider runtime={runtime}>
      <QueryClientProvider client={cache}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TestI18nProvider>,
  );
  return { cache, router };
}
it('offers personal self service while hiding organization management', async () => {
  setup('/keys');
  expect(await screen.findByText('No API keys')).toBeVisible();
  expect(screen.queryByRole('tab', { name: 'Organization keys' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Create key' })).toHaveLength(1);
});
it('validates lifetime and selection and never sends a client-controlled owner', async () => {
  setup('/keys/new');
  const user = userEvent.setup();
  const name = await screen.findByLabelText('Key name *');
  await user.type(name, 'Personal integration');
  const days = screen.getByLabelText('Lifetime in days *');
  await user.clear(days);
  await user.type(days, '366');
  await user.click(
    screen.getByRole('button', { name: 'Create key', exact: true }),
  );
  expect(screen.getByText('Enter a whole number from 1 to 365.')).toBeVisible();
  expect(
    state.request.mock.calls.some(([request]) => request.method === 'POST'),
  ).toBe(false);
  await user.clear(days);
  await user.type(days, '1');
  await user.click(
    screen.getByRole('button', { name: 'Create key', exact: true }),
  );
  expect(await screen.findByLabelText('Key secret')).toHaveValue(
    'synthetic-once-only',
  );
  const input = state.request.mock.calls.find(
    ([request]) => request.method === 'POST',
  )![0].json;
  expect(input).not.toHaveProperty('userId');
  expect(input.type).toBe('personal');
  expect(input.expiresInDays).toBe(1);
});
it('discards a newly issued secret on close and keeps it out of query caches', async () => {
  const { cache } = setup('/keys/new');
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText('Key name *'),
    'Transient secret',
  );
  await user.click(
    screen.getByRole('button', { name: 'Create key', exact: true }),
  );
  expect(await screen.findByLabelText('Key secret')).toBeVisible();
  expect(
    JSON.stringify(
      cache
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain('synthetic-once-only');
  await user.click(screen.getByRole('button', { name: 'Done', exact: true }));
  expect(screen.queryByLabelText('Key secret')).toBeNull();
});

it('keeps consecutive search input intact before committing it to the URL', async () => {
  setup('/keys');
  const input = await screen.findByRole('textbox', { name: 'Search keys' });
  await userEvent.type(input, 'missing');
  expect(input).toHaveValue('missing');
  expect(screen.getByText('No matching records')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(input).toHaveValue('');
});
