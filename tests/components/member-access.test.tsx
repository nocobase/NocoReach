import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { ApiClientError, NavigationGuardProvider } from '@nocobase/app-client';
import { setDictionary } from '../../client/i18n';
import enUS from '../../client/locales/en-US';
import dictionary from '../../shared/i18n/en.json';
import Members from '../../client/pages/members';
import MemberForm from '../../client/pages/access/member-form';
import AcceptInvitation from '../../client/pages/access/accept';
import Roles from '../../client/pages/access/roles';
import RoleForm from '../../client/pages/access/role-form';

const state = vi.hoisted(() => ({ request: vi.fn(), canManage: true }));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<object>()),
  useApiClient: () => state,
}));
vi.mock('@nocobase/app-plugin-authentication/client', async (original) => ({
  ...(await original<object>()),
  useAuthentication: () => ({
    session: { user: { id: 'actor' }, session: { id: 'test-session' } },
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<object>()),
  useAuthorizationRevision: () => 'test-revision',
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: 'actor' }, reload: vi.fn() }),
}));
const roles = [
  {
    key: 'nr.member',
    title: 'Member',
    grants: [],
    builtIn: true,
    assignable: true,
    revision: 'one',
  },
  {
    key: 'nr.reader',
    title: 'Reader',
    grants: [],
    builtIn: false,
    assignable: true,
    revision: 'two',
  },
];
const member = {
  id: 'person',
  name: 'Synthetic person',
  account: 'synthetic@example.test',
  roles: ['nr.member', 'nr.reader'],
  locked: false,
};
const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
beforeEach(() => {
  setDictionary(dictionary);
  state.canManage = true;
  state.request.mockReset();
  state.request.mockImplementation(
    async ({ path, method }: { path: string; method: string }) => {
      if (path === 'nocoreachAccess/roles')
        return { data: { items: roles, canManage: state.canManage } };
      if (path === 'nocoreachAccess/catalog')
        return { data: { actions: [], pages: [], settings: [], projects: [] } };
      if (path === 'nocoreachAccess/roles/nr.reader')
        return { data: { ...roles[1], title: 'Fresh reader' } };
      if (path === 'nocoreachAccess/members/person') return { data: member };
      if (path === 'nocoreachAccess/members')
        return { data: { items: [member], canManage: state.canManage } };
      if (path === 'nocoreachAccess/invitations' && method === 'GET')
        return { data: [] };
      return { data: null };
    },
  );
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});
function setup(path = '/members') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: (
          <NavigationGuardProvider>
            <Outlet />
          </NavigationGuardProvider>
        ),
        children: [
          {
            path: '/members',
            element: <Members />,
            children: [
              { path: 'invite', element: <MemberForm /> },
              { path: ':memberId/roles', element: <MemberForm /> },
            ],
          },
          {
            path: '/roles',
            element: <Roles />,
            children: [
              { path: 'new', element: <RoleForm /> },
              { path: ':roleKey', element: <RoleForm /> },
            ],
          },
          {
            path: '/member-invitations/:invitationId',
            element: <AcceptInvitation />,
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <TestI18nProvider runtime={runtime}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TestI18nProvider>,
  );
  return router;
}

it('shows multiple role names and hides management and pending reads without their grant', async () => {
  state.canManage = false;
  setup();
  expect(await screen.findByText('Synthetic person')).toBeVisible();
  expect(screen.getByText('Member', { exact: true })).toBeVisible();
  expect(screen.getByText('Reader', { exact: true })).toBeVisible();
  expect(screen.queryByText('Invite member', { exact: true })).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Pending invitations' }),
  ).toBeNull();
  expect(
    state.request.mock.calls.some(
      ([input]) => input.path === 'nocoreachAccess/invitations',
    ),
  ).toBe(false);
  await act(async () => setDictionary(null));
  expect(
    screen.getByRole('heading', { name: '成员', exact: true }),
  ).toBeVisible();
});

it('loads fresh member roles and saves all selected roles before returning to the filtered parent', async () => {
  const router = setup('/members/person/roles?tab=members&q=Synthetic');
  expect(
    await screen.findByRole('dialog', { name: 'Edit roles' }),
  ).toBeVisible();
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', { name: 'Member', exact: true }),
    ).toBeChecked(),
  );
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Reader', exact: true }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'nocoreachAccess/members/person/roles',
        method: 'POST',
        json: { roles: ['nr.member'] },
      }),
    ),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe('/members'));
  expect(router.state.location.search).toBe('?tab=members&q=Synthetic');
});

it('validates invitation fields, preserves input on failure and never issues membership assignment', async () => {
  setup('/members/invite?tab=invitations');
  const user = userEvent.setup();
  await screen.findByRole('dialog', { name: 'Invite member' });
  await user.click(
    await screen.findByRole('button', { name: 'Invite', exact: true }),
  );
  expect(screen.getByText('Enter a valid email address.')).toBeVisible();
  await user.type(screen.getByLabelText('Email *'), 'new@example.test');
  await user.click(
    screen.getByRole('checkbox', { name: 'Member', exact: true }),
  );
  state.request.mockImplementationOnce(async () => {
    throw new ApiClientError('unsafe backend detail', {
      status: 403,
      reason: 'ungrantable',
      method: 'POST',
      url: 'nocoreachAccess/invitations',
    });
  });
  await user.click(screen.getByRole('button', { name: 'Invite', exact: true }));
  expect(
    await screen.findByText(
      'These permissions exceed what you may grant. Choose a narrower role or range.',
    ),
  ).toBeVisible();
  expect(screen.getByLabelText('Email *')).toHaveValue('new@example.test');
  expect(screen.queryByText('unsafe backend detail')).toBeNull();
  expect(
    state.request.mock.calls.some(
      ([input]) => input.path.endsWith('/roles') && input.method === 'POST',
    ),
  ).toBe(false);
});

it('reports a wrong-account invitation without a retry and keeps a concrete next step', async () => {
  const original = state.request.getMockImplementation()!;
  state.request.mockImplementation((input) =>
    input.path.includes('/mine/')
      ? Promise.reject(
          new ApiClientError('wrongAccount', {
            status: 404,
            reason: 'wrongAccount',
            method: 'GET',
            url: input.path,
          }),
        )
      : original(input),
  );
  setup('/member-invitations/unknown');
  expect(
    await screen.findByText(
      'This invitation is unavailable to this account. Switch to the invited account.',
    ),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
});

it('shows built-in and custom definitions without exposing edit controls to a reader', async () => {
  state.canManage = false;
  setup('/roles');
  expect(await screen.findByText('Built-in')).toBeVisible();
  expect(screen.getByText('Custom')).toBeVisible();
  expect(screen.queryByText('New role', { exact: true })).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Actions for Reader' }),
  ).toBeNull();
});

it('reads a fresh role definition independently of the cached parent list', async () => {
  setup('/roles/nr.reader?q=Reader');
  expect(await screen.findByDisplayValue('Fresh reader')).toBeVisible();
  expect(state.request).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'nocoreachAccess/roles/nr.reader' }),
  );
});

it('focuses a duplicate role identifier and clears its field error when edited', async () => {
  setup('/roles/new');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Role name *'), 'Example');
  await user.type(screen.getByLabelText('Role identifier *'), 'duplicate');
  state.request.mockImplementationOnce(async () => {
    throw new ApiClientError('roleExists', {
      status: 409,
      reason: 'roleExists',
      method: 'POST',
      url: 'nocoreachAccess/roles',
    });
  });
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(screen.getByLabelText('Role identifier *')).toHaveFocus(),
  );
  expect(screen.getByLabelText('Role identifier *')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await user.type(screen.getByLabelText('Role identifier *'), '-new');
  expect(screen.getByLabelText('Role identifier *')).toHaveAttribute(
    'aria-invalid',
    'false',
  );
});
