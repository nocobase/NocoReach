import {
  ClientApplicationContext,
  NavigationGuardProvider,
  realtimeClientToken,
  type ClientApplication,
} from '@nocobase/app-client';
import {
  AuthenticationProvider,
  authenticationClientToken,
  useAuthentication,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { reactProviders } from '@nocobase/app-plugin-authorization/client/react-providers';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Outlet } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AppRouter } from '../../client/routing/app-router.js';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../../client/components/ui/dialog.js';
import enUS from '../../client/locales/en-US.js';
import { nocobaseClient } from '../../client/lib/nocoreach-api.js';

vi.mock('../../client/lib/nocoreach-api.js', () => ({
  nocobaseClient: { action: vi.fn() },
  NocoReachHttpError: class extends Error {},
}));
// Keep the real member/cache providers; unrelated sidebar requests are covered separately.
vi.mock('../../client/components/app-shell/nav-badges.js', () => ({
  NavBadgeProvider: ({ children }: { children: import('react').ReactNode }) =>
    children,
}));

const AuthorizationProvider = reactProviders[0].component;
vi.mock('../../client/layouts/app-layout.js', () => ({
  AppLayout: () => <Outlet />,
}));
vi.mock('../../client/routing/standalone-page-layout.js', () => ({
  StandalonePageLayout: () => <Outlet />,
}));
const runtime = await createTestI18nRuntime({
  application: { namespace: 'test', resources: enUS },
});
afterEach(() => vi.useRealTimers());

async function setup({ active = true, authenticated = true } = {}) {
  const memberRequest = vi.mocked(nocobaseClient.action);
  memberRequest.mockReset();
  memberRequest.mockResolvedValue({ id: 'user', name: 'User', role: 'member' });
  const allowed = {
    data: {
      unrestricted: false,
      permissions: [
        { resource: { type: 'page', id: 'probe' }, actions: ['access'] },
      ],
    },
  };
  const request = vi.fn().mockResolvedValue(allowed);
  const authz = new AuthorizationClient({ request } as never);
  const services = new ServiceContainer();
  const listeners = new Set<() => void>();
  const realtime = {
    active,
    reconnect: vi.fn(),
    onOpen: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const signOut = vi.fn().mockResolvedValue({ error: { message: 'Offline' } });
  let session: unknown = authenticated
    ? { user: { id: 'user' }, session: { id: 'session' } }
    : null;
  const getSession = vi.fn(async () => ({ data: session }));
  services.instance(authenticationClientToken, {
    getSession,
    signOut,
  } as never);
  services.instance(realtimeClientToken, realtime as never);
  services.instance(authorizationClientToken, authz);
  const mounted = vi.fn();
  const cleaned = vi.fn();
  const accepted = vi.fn();
  const old = Promise.withResolvers<void>();
  function Page() {
    useEffect(() => {
      let active = true;
      mounted();
      void old.promise.then(() => {
        if (active) accepted();
      });
      return () => {
        active = false;
        cleaned();
      };
    }, []);
    return (
      <Dialog open>
        <DialogContent>
          <DialogTitle>Protected dialog</DialogTitle>
          <DialogDescription>Protected content</DialogDescription>
        </DialogContent>
      </Dialog>
    );
  }
  let refresh!: () => Promise<void>;
  function Capture() {
    refresh = useAuthentication().refresh;
    return null;
  }
  const route = {
    id: 'probe',
    name: 'probe',
    path: '/',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'probe' }, action: 'access' },
    packageName: 'test',
    source: 'application',
    componentLoader: async () => ({ default: Page }),
  } as const;
  render(
    <TestI18nProvider runtime={runtime}>
      <ClientApplicationContext.Provider
        value={{ services } as unknown as ClientApplication}
      >
        <AuthenticationProvider>
          <Capture />
          <AuthorizationProvider>
            <MemoryRouter>
              <NavigationGuardProvider>
                <AppRouter
                  clientRoutes={[
                    route,
                    {
                      id: 'login',
                      name: 'login',
                      path: '/login',
                      auth: 'guest',
                      authz: 'skip',
                      source: 'application',
                      packageName: 'test',
                      componentLoader: async () => ({
                        default: () => <p>Login route</p>,
                      }),
                    },
                  ]}
                />
              </NavigationGuardProvider>
            </MemoryRouter>
          </AuthorizationProvider>
        </AuthenticationProvider>
      </ClientApplicationContext.Provider>
    </TestI18nProvider>,
  );
  await act(async () => {});
  // Register after preparation to prove ordering does not depend on effects.
  listeners.add(() => authz.invalidate());
  return {
    allowed,
    memberRequest,
    request,
    authz,
    realtime,
    signOut,
    getSession,
    mounted,
    cleaned,
    accepted,
    old,
    open: async () => {
      await act(async () => {
        for (const listener of listeners) listener();
      });
    },
    login: async (id = 'session') => {
      session = { user: { id: 'user' }, session: { id } };
      await act(async () => refresh());
    },
    logout: async () => {
      session = null;
      await act(async () => refresh());
    },
  };
}

it('mounts only after the initial handshake and preserves runtime fail-closed portal cleanup', async () => {
  const probe = await setup();
  expect(probe.mounted).not.toHaveBeenCalled();
  expect(probe.request).not.toHaveBeenCalled();
  expect(probe.memberRequest).not.toHaveBeenCalled();
  await probe.open();
  await screen.findByText('Protected dialog');
  expect(probe.mounted).toHaveBeenCalledOnce();
  expect(probe.request).toHaveBeenCalledOnce();
  expect(probe.memberRequest).toHaveBeenCalledOnce();
  const next = Promise.withResolvers<typeof probe.allowed>();
  probe.request.mockReturnValueOnce(next.promise);
  await probe.open();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(probe.cleaned).toHaveBeenCalledOnce();
  await act(async () => probe.old.resolve());
  expect(probe.accepted).not.toHaveBeenCalled();
  await act(async () =>
    next.resolve({ data: { unrestricted: false, permissions: [] } }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(await screen.findByText('Access denied')).toBeVisible();
});

it('keeps a timed-out session closed, supports retry, and reports sign-out failure', async () => {
  vi.useFakeTimers();
  const probe = await setup();
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(screen.getByText('Unable to connect')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await act(async () => {});
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to sign out');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(probe.realtime.reconnect).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Unable to connect')).toBeNull();
  await probe.open();
  expect(probe.mounted).toHaveBeenCalledOnce();
});

it('can sign out of a failed initialization without a working realtime connection', async () => {
  vi.useFakeTimers();
  const probe = await setup();
  await act(async () => vi.advanceTimersByTime(10_000));
  probe.signOut.mockResolvedValueOnce({});
  probe.getSession.mockResolvedValueOnce({ data: null });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await act(async () => {});
  expect(screen.getByText('Login route')).toBeVisible();
  expect(probe.mounted).not.toHaveBeenCalled();
});

it('keeps guest login reachable and prepares every newly signed-in session', async () => {
  const probe = await setup({ authenticated: false });
  expect(await screen.findByText('Login route')).toBeVisible();
  expect(probe.realtime.reconnect).not.toHaveBeenCalled();
  await probe.login();
  expect(probe.mounted).not.toHaveBeenCalled();
  expect(probe.memberRequest).not.toHaveBeenCalled();
  await probe.open();
  expect(await screen.findByText('Protected dialog')).toBeVisible();
  expect(probe.mounted).toHaveBeenCalledOnce();
  expect(probe.memberRequest).toHaveBeenCalledOnce();
  await probe.logout();
  expect(await screen.findByText('Login route')).toBeVisible();
  await probe.login('second-session');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(probe.mounted).toHaveBeenCalledOnce();
  await probe.open();
  expect(await screen.findByText('Protected dialog')).toBeVisible();
  expect(probe.mounted).toHaveBeenCalledTimes(2);
  expect(probe.memberRequest).toHaveBeenCalledTimes(2);
});

it('enters immediately without active realtime subscriptions', async () => {
  const probe = await setup({ active: false });
  expect(await screen.findByText('Protected dialog')).toBeVisible();
  expect(probe.mounted).toHaveBeenCalledOnce();
  expect(probe.memberRequest).toHaveBeenCalledOnce();
  expect(probe.realtime.reconnect).not.toHaveBeenCalled();
});
