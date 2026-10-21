import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
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
import InviteForm from '../../client/pages/access/invite-form';
import AcceptInvitation from '../../client/pages/access/accept';
import RoleForm from '../../client/pages/access/role-form';
import { usePendingInvitationCount } from '../../client/pages/access/api';

const state = vi.hoisted(() => ({
  request: vi.fn(),
  canManage: true,
  authorization: { can: vi.fn(), invalidate: vi.fn() },
}));
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
  useAuthorizationClient: () => state.authorization,
  useAuthorizationRevision: () => 'test-revision',
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: 'actor' }, reload: vi.fn() }),
}));
const roles = [
  {
    key: 'nr.member',
    title: 'Member',
    scope: 'member',
    capabilities: ['view'],
    builtIn: true,
    assignable: true,
    revision: 'one',
  },
  {
    key: 'nr.reader',
    title: 'Reader',
    scope: 'member',
    capabilities: ['view'],
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
  projects: ['1'],
  locked: false,
};
const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
beforeEach(() => {
  setDictionary(dictionary);
  state.canManage = true;
  state.authorization.can.mockReset();
  state.authorization.can.mockImplementation(async () => state.canManage);
  state.authorization.invalidate.mockReset();
  state.request.mockReset();
  state.request.mockImplementation(
    async ({ path, method }: { path: string; method: string }) => {
      if (path === 'nocoreachAccess/roles')
        return { data: { items: roles, canManage: state.canManage } };
      if (path === 'nocoreachAccess/catalog')
        return {
          data: {
            projects: [
              { id: '1', name: 'Alpha' },
              { id: '2', name: 'Beta' },
            ],
          },
        };
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
function setup(
  path = '/members',
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
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
              { path: 'invite', element: <InviteForm /> },
              { path: ':memberId/roles', element: <MemberForm /> },
              { path: 'roles/new', element: <RoleForm /> },
              { path: 'roles/:roleKey', element: <RoleForm /> },
            ],
          },
          {
            path: '/member-invitations/:invitationId?',
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
  expect(await screen.findByText('Alpha')).toBeVisible();
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
    screen.getByRole('heading', { name: '成员与角色', exact: true }),
  ).toBeVisible();
});

it('loads fresh member roles and saves all selected roles before returning to the filtered parent', async () => {
  const router = setup('/members/person/roles?tab=members&q=Synthetic');
  expect(
    await screen.findByRole('dialog', { name: 'Edit member' }),
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
        json: {
          roles: ['nr.member'],
          expectedRoles: ['nr.member', 'nr.reader'],
          projectIds: ['1'],
          expectedProjects: ['1'],
        },
      }),
    ),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe('/members'));
  expect(router.state.location.search).toBe('?tab=members&q=Synthetic');
});

it('keeps the original role snapshot after a refresh and preserves a conflicting draft', async () => {
  const client = new QueryClient();
  const request = state.request.getMockImplementation()!;
  let currentMember = member;
  state.request.mockImplementation(async (input) => {
    if (input.path === 'nocoreachAccess/members/person')
      return { data: currentMember };
    if (input.path === 'nocoreachAccess/members/person/roles')
      throw new ApiClientError('changed', {
        status: 409,
        reason: 'changed',
        method: 'POST',
        url: input.path,
      });
    return request(input);
  });
  const router = setup('/members/person/roles', client);
  const reader = await screen.findByRole('checkbox', {
    name: 'Reader',
    exact: true,
  });
  await userEvent.click(reader);
  currentMember = { ...member, roles: ['nr.reader'] };
  await act(() => client.invalidateQueries({ queryKey: ['reach-access'] }));
  expect(reader).not.toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Member', exact: true }),
  ).toBeChecked();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  expect(
    await screen.findByText(
      'This record changed. Refresh before trying again.',
    ),
  ).toBeVisible();
  expect(state.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: 'nocoreachAccess/members/person/roles',
      json: {
        roles: ['nr.member'],
        expectedRoles: ['nr.member', 'nr.reader'],
        projectIds: ['1'],
        expectedProjects: ['1'],
      },
    }),
  );
  expect(reader).not.toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Member', exact: true }),
  ).toBeChecked();
  expect(router.state.location.pathname).toBe('/members/person/roles');
});

it('validates several addresses, sends them with projects and preserves input on failure', async () => {
  setup('/members/invite?tab=invitations');
  const user = userEvent.setup();
  await screen.findByRole('dialog', { name: 'Invite member' });
  const send = await screen.findByRole('button', {
    name: 'Send invitations',
    exact: true,
  });
  await user.click(send);
  expect(screen.getByText('Enter at least one email address.')).toBeVisible();
  const emails = screen.getByLabelText('Email');
  await user.type(emails, 'alice@example.test, not-an-email');
  await user.click(send);
  expect(
    screen.getByText('These addresses are not valid: not-an-email'),
  ).toBeVisible();
  await user.clear(emails);
  await user.type(emails, 'alice@example.test{Enter}BOB@example.test');
  await user.click(screen.getByLabelText('Projects'));
  await user.click(await screen.findByRole('option', { name: 'Beta' }));
  state.request.mockImplementationOnce(async () => {
    throw new ApiClientError('unsafe backend detail', {
      status: 403,
      reason: 'ungrantable',
      method: 'POST',
      url: 'nocoreachAccess/invitations',
    });
  });
  await user.click(send);
  expect(
    await screen.findByText(
      'These permissions exceed what you may grant. Choose a narrower role or range.',
    ),
  ).toBeVisible();
  expect(emails).toHaveValue('alice@example.test\nBOB@example.test');
  expect(screen.queryByText('unsafe backend detail')).toBeNull();
  expect(state.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: 'nocoreachAccess/invitations',
      method: 'POST',
      json: {
        emails: ['alice@example.test', 'bob@example.test'],
        projectIds: ['2'],
      },
    }),
  );
});

it('shows each address outcome and keeps links when a refresh fails', async () => {
  const request = state.request.getMockImplementation()!;
  let catalogueReads = 0;
  state.request.mockImplementation(async (input) => {
    if (input.path === 'nocoreachAccess/catalog' && ++catalogueReads > 1)
      throw new Error('Catalogue refresh failed');
    if (input.path === 'nocoreachAccess/invitations' && input.method === 'POST')
      return {
        data: [
          {
            email: 'new@example.test',
            outcome: 'invited',
            emailSent: false,
            inviteUrl:
              'https://example.test/member-invitations/new?token=fixture',
          },
          { email: 'synthetic@example.test', outcome: 'added' },
          {
            email: 'pending@example.test',
            outcome: 'failed',
            reason: 'alreadyPending',
          },
        ],
      };
    return request(input);
  });
  setup('/members/invite');
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText('Email'),
    'new@example.test synthetic@example.test pending@example.test',
  );
  await user.click(screen.getByRole('button', { name: 'Send invitations' }));
  expect(await screen.findByLabelText('Invitation link')).toHaveValue(
    'https://example.test/member-invitations/new?token=fixture',
  );
  expect(screen.getByText('Added to projects')).toBeVisible();
  expect(screen.getByText('Not invited')).toBeVisible();
  expect(
    state.request.mock.calls.filter(([input]) => input.method === 'POST'),
  ).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Done', exact: true }));
  await waitFor(() =>
    expect(screen.queryByLabelText('Invitation link')).toBeNull(),
  );
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

it('keeps an accepted invitation discoverable after navigating from the list and remounting', async () => {
  let accepted = false;
  const invitation = () => ({
    id: 'offer',
    email: 'actor@example.test',
    status: accepted ? 'accepted' : 'pending',
    expiresAt: '2026-10-24T00:00:00.000Z',
  });
  state.request.mockImplementation(async ({ path }: { path: string }) => {
    if (path === 'nocoreachAccess/mine')
      return { data: accepted ? [] : [invitation()] };
    if (path === 'nocoreachAccess/mine/offer/accept') {
      accepted = true;
      return { data: { accepted: true } };
    }
    if (path === 'nocoreachAccess/mine/offer') return { data: invitation() };
    return { data: null };
  });
  const router = setup('/member-invitations');
  await userEvent.click(
    await screen.findByRole('button', { name: 'Accept invitation' }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/member-invitations/offer'),
  );
  expect(await screen.findByText('You have joined NocoReach')).toBeVisible();
  cleanup();
  setup(router.state.location.pathname);
  expect(await screen.findByText('You have joined NocoReach')).toBeVisible();
  expect(screen.queryByText('No invitations for this account')).toBeNull();
  expect(
    state.request.mock.calls.filter(([input]) =>
      input.path.endsWith('/accept'),
    ),
  ).toHaveLength(1);
});

function countInvitations(enabled?: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => usePendingInvitationCount(enabled), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

it('counts only the pending, unexpired invitations of the signed-in account', async () => {
  state.request.mockImplementation(async ({ path }: { path: string }) =>
    path === 'nocoreachAccess/mine'
      ? {
          data: [
            { id: 'one', status: 'pending' },
            { id: 'two', status: 'expired' },
            { id: 'three', status: 'pending' },
          ],
        }
      : { data: null },
  );
  const { result } = countInvitations();
  await waitFor(() => expect(result.current).toBe(2));
});

it('counts no invitations when the read fails or is not enabled', async () => {
  state.request.mockRejectedValue(
    new ApiClientError('accountUnavailable', {
      status: 403,
      reason: 'accountUnavailable',
      method: 'GET',
      url: 'nocoreachAccess/mine',
    }),
  );
  const failed = countInvitations();
  await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
  expect(failed.result.current).toBe(0);
  failed.unmount();
  state.request.mockClear();
  const disabled = countInvitations(false);
  expect(disabled.result.current).toBe(0);
  expect(state.request).not.toHaveBeenCalled();
});

it('shows built-in and custom definitions without exposing edit controls to a reader', async () => {
  state.canManage = false;
  setup('/members?tab=roles');
  expect(await screen.findByText('Built-in')).toBeVisible();
  expect(screen.getByText('Custom')).toBeVisible();
  expect(screen.queryByText('New role', { exact: true })).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Actions for Reader' }),
  ).toBeNull();
});

it('saves a role as a project scope and capabilities, with sites used and configured separately', async () => {
  const router = setup('/members/roles/new?tab=roles');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Role name *'), 'Operator');
  await user.type(screen.getByLabelText('Role identifier *'), 'operator');
  await user.click(screen.getByRole('radio', { name: /^All projects/ }));
  await user.click(
    screen.getByRole('checkbox', { name: /^Create and work on tasks/ }),
  );
  await user.click(screen.getByRole('checkbox', { name: 'YouTube' }));
  await user.click(
    screen.getByRole('checkbox', { name: /^Configure sources/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'nocoreachAccess/roles',
        method: 'POST',
        json: {
          key: 'nr.operator',
          title: 'Operator',
          scope: 'all',
          capabilities: ['tasks', 'sources.use.youtube', 'sources.configure'],
        },
      }),
    ),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe('/members'));
  expect(router.state.location.search).toBe('?tab=roles');
});

it('reads a fresh role definition independently of the cached parent list', async () => {
  setup('/members/roles/nr.reader?tab=roles&q=Reader');
  expect(await screen.findByDisplayValue('Fresh reader')).toBeVisible();
  expect(state.request).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'nocoreachAccess/roles/nr.reader' }),
  );
});

it('keeps the opening role revision after a refresh and preserves a conflicting draft', async () => {
  const client = new QueryClient();
  const request = state.request.getMockImplementation()!;
  let currentRole = { ...roles[1], title: 'Opening role' };
  state.request.mockImplementation(async (input) => {
    if (input.path === 'nocoreachAccess/roles/nr.reader') {
      if (input.method === 'GET') return { data: currentRole };
      if (input.json.revision !== currentRole.revision)
        throw new ApiClientError('changed', {
          status: 409,
          reason: 'changed',
          method: 'PUT',
          url: input.path,
        });
      return { data: { ...currentRole, ...input.json } };
    }
    return request(input);
  });
  const router = setup('/members/roles/nr.reader?tab=roles', client);
  const name = await screen.findByLabelText('Role name *');
  await userEvent.clear(name);
  await userEvent.type(name, 'My unsaved draft');
  currentRole = {
    ...currentRole,
    title: 'Another administrator update',
    revision: 'updated',
  };
  await act(() => client.invalidateQueries({ queryKey: ['reach-access'] }));
  expect(name).toHaveValue('My unsaved draft');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save', exact: true }),
  );
  expect(
    await screen.findByText(
      'This record changed. Refresh before trying again.',
    ),
  ).toBeVisible();
  expect(state.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: 'nocoreachAccess/roles/nr.reader',
      method: 'PUT',
      json: expect.objectContaining({
        title: 'My unsaved draft',
        revision: 'two',
      }),
    }),
  );
  expect(name).toHaveValue('My unsaved draft');
  expect(router.state.location.pathname).toBe('/members/roles/nr.reader');
});

it.each(['denied', 'failed'] as const)(
  'keeps role editing unavailable while authorization is pending or %s',
  async (result) => {
    const permission = Promise.withResolvers<boolean>();
    state.authorization.can.mockReturnValue(permission.promise);
    setup('/members/roles/nr.reader?tab=roles');
    await waitFor(() =>
      expect(state.request).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'nocoreachAccess/roles/nr.reader' }),
      ),
    );
    expect(screen.queryByLabelText('Role name *')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await act(async () => {
      if (result === 'denied') permission.resolve(false);
      else permission.reject(new Error('Authorization lookup failed'));
    });
    if (result === 'denied')
      expect(await screen.findByLabelText('Role name *')).toBeDisabled();
    else {
      expect(await screen.findByRole('alert')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
      expect(screen.queryByLabelText('Role name *')).toBeNull();
      expect(screen.queryByText('Authorization lookup failed')).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  },
);

it('focuses a duplicate role identifier and clears its field error when edited', async () => {
  setup('/members/roles/new?tab=roles');
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

it('shows the roles tab for a role form whose link lost the tab query', async () => {
  setup('/members/roles/nr.reader');
  expect(await screen.findByDisplayValue('Fresh reader')).toBeVisible();
  expect(
    await screen.findByRole('button', { name: 'Roles', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});
