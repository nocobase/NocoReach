import {
  ClientApplicationContext,
  type ClientApplication,
} from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { reactProviders as authorizationProviders } from '@nocobase/app-plugin-authorization/client/react-providers';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { MemoryRouter, Outlet } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRouter } from '../../client/routing/app-router';
import { useMe, MemberGate } from '../../client/pages/me';
import { useFreshData } from '../../client/pages/workspace-cache';
import { useProjects } from '../../client/pages/reach-data';
import enUS from '../../client/locales/en-US';
import { setDictionary, useNocoReachLocale } from '../../client/i18n';
import businessEnglish from '../../shared/i18n/en.json';

const authentication = vi.hoisted(() => ({
  session: null as null | { user: { id: string }; session: { id: string } },
  isPending: false,
  client: { signOut: vi.fn() },
  refresh: vi.fn(),
}));
const api = vi.hoisted(() => ({ action: vi.fn(), wrapRequests: vi.fn() }));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => authentication,
  RequiredAuthentication: ({ children }: { children: ReactNode }) =>
    authentication.session && !authentication.isPending ? (
      children
    ) : (
      <p>Sign in</p>
    ),
  GuestAuthentication: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../client/lib/nocoreach-api', () => ({ nocobaseClient: api }));
vi.mock('../../client/layouts/app-layout', () => ({
  AppLayout: () => (
    <>
      <AccessProbe />
      <DataProbe />
      <Outlet />
    </>
  ),
}));
const AuthorizationProvider = authorizationProviders[0].component;
const runtime = await createTestI18nRuntime({
  application: { namespace: 'nocoreach', resources: enUS },
});
function AccessProbe() {
  const { me, isAdmin, can, mine, reload } = useMe();
  return (
    <>
      <span data-testid='role'>{isAdmin ? 'admin' : 'restricted'}</span>
      <span data-testid='id'>{me?.id ?? 'unknown'}</span>
      <span data-testid='can'>{String(can())}</span>
      <span data-testid='mine'>{String(mine('member'))}</span>
      <button onClick={reload}>Recheck access</button>
      {isAdmin ? <button>Admin setting</button> : null}
    </>
  );
}
function DataProbe() {
  const { projects } = useProjects();
  const { data } = useFreshData<string>('data-view:shared', () =>
    api.action('report'),
  );
  return (
    <>
      <span data-testid='project'>{projects?.[0]?.name ?? 'loading'}</span>
      <span data-testid='report'>{data ?? 'loading'}</span>
    </>
  );
}
function LocalizedMemberGate() {
  // Mirror NocoReachRoute's locale subscription without remounting the real gate.
  useNocoReachLocale();
  return (
    <MemberGate>
      <p>Protected page</p>
      <AccessProbe />
    </MemberGate>
  );
}
const routes = [
  {
    id: 'home',
    name: 'home',
    path: '/',
    packageName: 'nocoreach',
    source: 'application' as const,
    auth: 'required' as const,
    authz: 'skip' as const,
    componentLoader: async () => ({
      default: LocalizedMemberGate,
    }),
  },
];
function session(user: string, id = `${user}-session`) {
  authentication.session = { user: { id: user }, session: { id } };
}
function setup(strict = false) {
  const container = new ServiceContainer();
  const authz = new AuthorizationClient({ request: vi.fn() } as never);
  container.instance(authorizationClientToken, authz);
  const app = { services: container } as unknown as ClientApplication;
  const tree = () => {
    const content = (
      <TestI18nProvider runtime={runtime}>
        <ClientApplicationContext.Provider value={app}>
          <MemoryRouter>
            <AuthorizationProvider>
              <AppRouter clientRoutes={routes} />
            </AuthorizationProvider>
          </MemoryRouter>
        </ClientApplicationContext.Provider>
      </TestI18nProvider>
    );
    return strict ? <StrictMode>{content}</StrictMode> : content;
  };
  const view = render(tree());
  return { ...view, authz, rerender: () => view.rerender(tree()) };
}
function result(resource: string) {
  const user = authentication.session?.user.id;
  return resource === 'nrMembers'
    ? { id: user, name: user, role: user === 'admin' ? 'admin' : 'member' }
    : resource === 'nrProjects'
      ? [{ id: 1, name: `${user} project` }]
      : `${user} private report`;
}
const memberCalls = () =>
  api.action.mock.calls.filter(([resource]) => resource === 'nrMembers');
async function expectRole(admin: boolean) {
  await waitFor(() =>
    expect(
      screen
        .getAllByTestId('role')
        .every((node) => node.textContent === (admin ? 'admin' : 'restricted')),
    ).toBe(true),
  );
  expect(
    screen.queryAllByRole('button', { name: 'Admin setting' }).length > 0,
  ).toBe(admin);
}
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  setDictionary(null);
  session('admin');
  authentication.isPending = false;
  api.action
    .mockReset()
    .mockImplementation((resource: string) =>
      Promise.resolve(result(resource)),
    );
  authentication.client.signOut.mockReset().mockResolvedValue({ data: null });
  authentication.refresh.mockReset().mockResolvedValue(undefined);
});

describe('NocoReach identity in the real authenticated route tree', () => {
  it('shares one lookup, removes admin actions synchronously on account change, and permits admin again', async () => {
    const view = setup();
    await screen.findByText('Protected page');
    await expectRole(true);
    expect(memberCalls()).toHaveLength(1);
    const pending = Promise.withResolvers<unknown>();
    api.action.mockImplementation((resource: string) =>
      resource === 'nrMembers'
        ? pending.promise
        : Promise.resolve(result(resource)),
    );
    session('member');
    view.rerender();
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
    await expectRole(false);
    expect(screen.getByTestId('can')).toHaveTextContent('false');
    expect(screen.getByTestId('mine')).toHaveTextContent('false');
    await act(async () => {
      pending.resolve({ id: 'member', role: 'member' });
      await pending.promise;
    });
    await screen.findByText('Protected page');
    await expectRole(false);
    expect(screen.getAllByTestId('can')[0]).toHaveTextContent('true');
    expect(screen.getAllByTestId('mine')[0]).toHaveTextContent('true');
    api.action.mockImplementation((resource: string) =>
      Promise.resolve(result(resource)),
    );
    session('admin', 'admin-return');
    view.rerender();
    await screen.findByText('Protected page');
    await expectRole(true);
    expect(memberCalls()).toHaveLength(3);
  });
  it('clears on pending/logout and reloads membership for a new session of the same user', async () => {
    const view = setup();
    await screen.findByText('Protected page');
    authentication.isPending = true;
    view.rerender();
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
    authentication.isPending = false;
    authentication.session = null;
    view.rerender();
    await screen.findByText('Sign in');
    expect(memberCalls()).toHaveLength(1);
    api.action.mockImplementation((resource: string) =>
      Promise.resolve(
        resource === 'nrMembers'
          ? { id: 'admin', role: 'member' }
          : result(resource),
      ),
    );
    session('admin', 'new-session');
    view.rerender();
    await screen.findByText('Protected page');
    await expectRole(false);
    expect(memberCalls()).toHaveLength(2);
  });
  it('ignores a late administrator response after the member has loaded', async () => {
    const old = Promise.withResolvers<unknown>();
    api.action.mockImplementation((resource: string) =>
      resource === 'nrMembers' && authentication.session?.user.id === 'admin'
        ? old.promise
        : Promise.resolve(result(resource)),
    );
    const view = setup();
    await waitFor(() => expect(memberCalls()).toHaveLength(1));
    session('member');
    view.rerender();
    await screen.findByText('Protected page');
    await act(async () => {
      old.resolve({ id: 'admin', role: 'admin' });
      await old.promise;
    });
    await expectRole(false);
    expect(screen.getAllByTestId('id')[0]).toHaveTextContent('member');
  });
  it.each([
    undefined,
    {},
    { id: 'admin' },
    { id: 'admin', role: 'owner' },
    { id: 'other', role: 'admin' },
  ])('fails closed for an invalid membership response %j', async (value) => {
    api.action.mockImplementation((resource: string) =>
      Promise.resolve(resource === 'nrMembers' ? value : result(resource)),
    );
    setup();
    await screen.findByText('无法读取成员权限');
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
    await expectRole(false);
    expect(screen.getByTestId('can')).toHaveTextContent('false');
  });
  it('fails closed on a request error and recovers through the visible retry', async () => {
    api.action.mockImplementation((resource: string) =>
      resource === 'nrMembers'
        ? Promise.reject(new Error('Offline'))
        : Promise.resolve(result(resource)),
    );
    setup();
    await screen.findByText('无法读取成员权限');
    await expectRole(false);
    api.action.mockImplementation((resource: string) =>
      Promise.resolve(result(resource)),
    );
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByText('Protected page');
    await expectRole(true);
  });
  it('handles explicit non-membership and rechecks after an administrator grants a role', async () => {
    api.action.mockImplementation((resource: string) =>
      Promise.resolve(
        resource === 'nrMembers'
          ? { id: 'admin', role: null }
          : result(resource),
      ),
    );
    setup();
    await screen.findByText('你还没有加入 NocoReach');
    expect(screen.queryByText('无法读取成员权限')).not.toBeInTheDocument();
    expect(screen.getByTestId('can')).toHaveTextContent('false');
    api.action.mockImplementation((resource: string) =>
      Promise.resolve(result(resource)),
    );
    fireEvent.click(screen.getByRole('button', { name: '重新检查' }));
    await screen.findByText('Protected page');
    await expectRole(true);
  });
  it('revalidates on the official permission revision, hiding old data and ignoring a superseded lookup', async () => {
    const view = setup();
    await screen.findByText('Protected page');
    const old = Promise.withResolvers<unknown>();
    api.action.mockImplementation((resource: string) =>
      resource === 'nrMembers'
        ? old.promise
        : Promise.resolve(result(resource)),
    );
    act(() => view.authz.invalidate());
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
    await expectRole(false);
    api.action.mockImplementation((resource: string) =>
      Promise.resolve(
        resource === 'nrMembers'
          ? { id: 'admin', role: 'member' }
          : result(resource),
      ),
    );
    act(() => view.authz.invalidate());
    await screen.findByText('Protected page');
    await act(async () => {
      old.resolve({ id: 'admin', role: 'admin' });
      await old.promise;
    });
    await expectRole(false);
  });
  it('ignores an earlier retry when a newer role check finishes first', async () => {
    setup();
    await screen.findByText('Protected page');
    const earlier = Promise.withResolvers<unknown>();
    api.action.mockImplementation((resource: string) =>
      resource === 'nrMembers'
        ? earlier.promise
        : Promise.resolve(result(resource)),
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Recheck access' })[0],
    );
    await expectRole(false);
    api.action.mockImplementation((resource: string) =>
      Promise.resolve(
        resource === 'nrMembers'
          ? { id: 'admin', role: 'member' }
          : result(resource),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Recheck access' }));
    await screen.findByText('Protected page');
    await act(async () => {
      earlier.resolve({ id: 'admin', role: 'admin' });
      await earlier.promise;
    });
    await expectRole(false);
  });
  it('does not mistake a failed Better Auth sign-out result for logout', async () => {
    api.action.mockImplementation((resource: string) =>
      Promise.resolve(
        resource === 'nrMembers'
          ? { id: 'admin', role: null }
          : result(resource),
      ),
    );
    authentication.client.signOut.mockResolvedValueOnce({
      error: { message: 'Unavailable' },
    });
    setup();
    await screen.findByText('你还没有加入 NocoReach');
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    await screen.findByText('退出登录失败，请重试。');
    expect(authentication.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    await waitFor(() => expect(authentication.refresh).toHaveBeenCalledOnce());
  });
  it('renders the permission failure and retry in English', async () => {
    setDictionary(businessEnglish);
    api.action.mockImplementation((resource: string) =>
      resource === 'nrMembers'
        ? Promise.reject(new Error('Offline'))
        : Promise.resolve(result(resource)),
    );
    setup();
    await screen.findByText('Unable to check membership');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
  });
});

describe('NocoReach workspace data belongs to one session', () => {
  it('does not show the previous project or report while a new session is loading', async () => {
    const view = setup();
    await screen.findByText('admin private report');
    expect(screen.getByTestId('project')).toHaveTextContent('admin project');
    api.action.mockImplementation(() => new Promise(() => {}));
    session('member');
    view.rerender();
    expect(screen.getByTestId('project')).toHaveTextContent('loading');
    expect(screen.getByTestId('report')).toHaveTextContent('loading');
    expect(sessionStorage.getItem('nr-cache:data-view:shared')).toBeNull();
  });
  it('prevents delayed old projects and reports from replacing the new session data', async () => {
    const old = Promise.withResolvers<string>();
    const oldProjects = Promise.withResolvers<unknown>();
    api.action.mockImplementation((resource: string) =>
      authentication.session?.user.id === 'admin' && resource === 'report'
        ? old.promise
        : authentication.session?.user.id === 'admin' &&
            resource === 'nrProjects'
          ? oldProjects.promise
          : Promise.resolve(result(resource)),
    );
    const view = setup();
    await screen.findByText('Protected page');
    session('member');
    view.rerender();
    await screen.findByText('member private report');
    await act(async () => {
      old.resolve('admin late report');
      oldProjects.resolve([{ id: 1, name: 'admin late project' }]);
      await old.promise;
    });
    expect(screen.getByTestId('report')).toHaveTextContent(
      'member private report',
    );
    expect(screen.getByTestId('project')).toHaveTextContent('member project');
    expect(
      JSON.parse(sessionStorage.getItem('nr-cache:data-view:shared') ?? '{}')
        .value,
    ).toBe('member private report');
  });
  it('cannot refill persisted reports after logout', async () => {
    const old = Promise.withResolvers<string>();
    api.action.mockImplementation((resource: string) =>
      resource === 'report' ? old.promise : Promise.resolve(result(resource)),
    );
    const view = setup();
    await screen.findByText('Protected page');
    authentication.session = null;
    view.rerender();
    await screen.findByText('Sign in');
    await act(async () => {
      old.resolve('admin late report');
      await old.promise;
    });
    expect(sessionStorage.getItem('nr-cache:data-view:shared')).toBeNull();
    expect(sessionStorage.getItem('nr-cache-owner')).toBeNull();
  });
  it('discards reports retained under the legacy token-based owner', async () => {
    sessionStorage.setItem('nr-cache-owner', '5381');
    sessionStorage.setItem(
      'nr-cache:data-view:shared',
      JSON.stringify({ value: 'old report', at: Date.now() }),
    );
    api.action.mockImplementation(() => new Promise(() => {}));
    setup();
    expect(screen.getByTestId('report')).toHaveTextContent('loading');
    expect(sessionStorage.getItem('nr-cache:data-view:shared')).toBeNull();
  });
  it('retains reload acceleration for a matching session/revision and works under StrictMode', async () => {
    sessionStorage.setItem(
      'nr-cache-owner',
      JSON.stringify(['admin', 'admin-session', 1]),
    );
    sessionStorage.setItem(
      'nr-cache:data-view:shared',
      JSON.stringify({ value: 'same-session report', at: Date.now() }),
    );
    const fresh = Promise.withResolvers<string>();
    api.action.mockImplementation((resource: string) =>
      resource === 'report' ? fresh.promise : Promise.resolve(result(resource)),
    );
    const view = setup();
    expect(screen.getByTestId('report')).toHaveTextContent(
      'same-session report',
    );
    await act(async () => {
      fresh.resolve('fresh report');
      await fresh.promise;
    });
    expect(screen.getByTestId('report')).toHaveTextContent('fresh report');
    view.unmount();
    api.action.mockImplementation((resource: string) =>
      Promise.resolve(result(resource)),
    );
    setup(true);
    await screen.findByText('Protected page');
    await screen.findByText('admin private report');
    expect(
      JSON.parse(sessionStorage.getItem('nr-cache:data-view:shared') ?? '{}')
        .value,
    ).toBe('admin private report');
  });
});

it('retranslates a mounted membership failure without granting access or changing the upstream error', async () => {
  const upstream = new Error('分析。任务。');
  api.action.mockImplementation((resource: string) =>
    resource === 'nrMembers'
      ? Promise.reject(upstream)
      : Promise.resolve(result(resource)),
  );
  setup();
  const message = '暂时无法确认你的 NocoReach 权限，请重试。';
  await screen.findByText(message);
  for (const dictionary of [businessEnglish, null, businessEnglish]) {
    await act(() => setDictionary(dictionary));
    expect(
      screen.getByText(
        dictionary
          ? businessEnglish['me.unableCheckNocoreachAccessRight']
          : message,
      ),
    ).toBeVisible();
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
    expect(upstream.message).toBe('分析。任务。');
    await expectRole(false);
  }
  api.action.mockImplementation((resource: string) =>
    Promise.resolve(result(resource)),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Protected page');
  await expectRole(true);
});

it('retranslates a mounted sign-out failure without refreshing the session', async () => {
  api.action.mockImplementation((resource: string) =>
    Promise.resolve(
      resource === 'nrMembers' ? { id: 'admin', role: null } : result(resource),
    ),
  );
  authentication.client.signOut.mockResolvedValue({
    error: { message: '分析。任务。' },
  });
  setup();
  await screen.findByText('你还没有加入 NocoReach');
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
  const message = '退出登录失败，请重试。';
  await screen.findByText(message);
  for (const dictionary of [businessEnglish, null, businessEnglish]) {
    await act(() => setDictionary(dictionary));
    expect(
      screen.getByText(
        dictionary ? businessEnglish['me.unableSignOutTryAgain'] : message,
      ),
    ).toBeVisible();
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
    expect(authentication.refresh).not.toHaveBeenCalled();
  }
});
