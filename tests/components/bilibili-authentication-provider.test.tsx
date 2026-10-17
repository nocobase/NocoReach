import {
  ClientApplicationContext,
  type ClientApplication,
} from '@nocobase/app-client';
import {
  AuthenticationProvider,
  authenticationClientToken,
  useAuthentication,
  type AuthClient,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { reactProviders } from '@nocobase/app-plugin-authorization/client/react-providers';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import enUS from '../../client/locales/en-US';
import { toast } from '../../client/lib/toast';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MeProvider, MemberGate } from '../../client/pages/me';
import { BilibiliConnect } from '../../client/pages/bilibili-connect';
import {
  bilibiliRequest,
  type BilibiliStatus,
} from '../../client/pages/bilibili-api';
import { setDictionary } from '../../client/i18n';

// Only transport responses and their timing are controlled. Both official
// providers, useAuthentication(), membership ownership and dialogs are real.
const network = vi.hoisted(() => ({
  session: { user: { id: 'admin-a' }, session: { id: 'session-a' } },
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    action: vi.fn(async () => ({
      id: network.session.user.id,
      name: 'Synthetic admin',
      role: 'admin',
    })),
    wrapRequests: vi.fn(),
  },
}));
vi.mock('../../client/pages/bilibili-api', () => ({
  bilibiliRequest: vi.fn(),
}));
const AuthorizationProvider = reactProviders[0].component;
const changes = vi.fn();
const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
function view(connected = true): BilibiliStatus {
  return {
    connected,
    revision: '641664cf-f741-4e91-b9dd-854b88ed1570',
    configured: true,
    collectorId: 'qa',
    collectors: [{ id: 'qa', name: 'Synthetic collector' }],
    terms: [network.session.session.id],
    bvids: [],
    verifiedAt: null,
    lastRun: null,
    total: 0,
    checking: false,
    requestId: null,
    recent: [],
  };
}
function SessionControls() {
  const { session, refresh, isPending } = useAuthentication();
  return (
    <>
      <span data-testid='session'>
        {isPending ? 'pending' : session?.session.id}
      </span>
      <button onClick={() => void refresh()}>Refresh official session</button>
    </>
  );
}
function Panel() {
  const { session } = useAuthentication();
  return (
    <BilibiliConnect
      projectId={1}
      isAdmin
      onChange={() => changes(session?.session.id)}
    />
  );
}
function setup() {
  const client = { getSession: vi.fn(async () => ({ data: network.session })) };
  const container = new ServiceContainer();
  container.instance(
    authenticationClientToken,
    client as unknown as AuthClient,
  );
  const authz = new AuthorizationClient({
    request: vi.fn(async () => ({
      data: {
        unrestricted: false,
        permissions: [
          {
            resource: { type: 'nocoreach', id: '1' },
            actions: [
              'nrBilibili.connect',
              'nrBilibili.test',
              'nrBilibili.sync',
              'nrBilibili.cancel',
              'nrBilibili.disconnect',
            ],
          },
        ],
      },
    })),
  } as never);
  container.instance(authorizationClientToken, authz);
  const app = { services: container } as unknown as ClientApplication;
  render(
    <TestI18nProvider runtime={runtime}>
      <ClientApplicationContext.Provider value={app}>
        <MemoryRouter>
          <AuthenticationProvider>
            <SessionControls />
            <AuthorizationProvider>
              <MeProvider>
                <MemberGate>
                  <Panel />
                </MemberGate>
              </MeProvider>
            </AuthorizationProvider>
          </AuthenticationProvider>
        </MemoryRouter>
      </ClientApplicationContext.Provider>
    </TestI18nProvider>,
  );
  return { client, authz };
}
async function openDisconnect() {
  fireEvent.click(await screen.findByRole('button', { name: '断开' }));
  return screen.findByRole('alertdialog');
}
async function confirm(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: '断开' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
}
const sessionConflict = () =>
  Object.assign(new Error('Session changed'), {
    status: 409,
    code: 'NOCOREACH_CONFIRMATION_SESSION_CHANGED',
  });
beforeEach(() => {
  network.session = { user: { id: 'admin-a' }, session: { id: 'session-a' } };
  changes.mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warning).mockClear();
  setDictionary(null);
  vi.mocked(bilibiliRequest)
    .mockReset()
    .mockImplementation(async (_project, action) =>
      view(action !== 'disconnect'),
    );
});
afterEach(async () => {
  await act(async () => cleanup());
});

for (const transition of [
  'new-account',
  'same-account-new-session',
  'permission-revision',
] as const) {
  it.each([
    'session-conflict',
    'revision-conflict',
    'forbidden',
    'success',
  ] as const)(
    `ignores late %s after ${transition} opens a new owner's confirmation`,
    async (outcome) => {
      const { client, authz } = setup();
      const oldDialog = await openDisconnect();
      const pending = Promise.withResolvers<BilibiliStatus>();
      vi.mocked(bilibiliRequest).mockImplementationOnce(() => pending.promise);
      await confirm(oldDialog);
      await waitFor(() =>
        expect(bilibiliRequest).toHaveBeenCalledWith(
          1,
          'disconnect',
          { revision: '641664cf-f741-4e91-b9dd-854b88ed1570' },
          'session-a',
        ),
      );

      if (transition === 'permission-revision') act(() => authz.invalidate());
      else {
        network.session = {
          user: { id: transition === 'new-account' ? 'admin-b' : 'admin-a' },
          session: { id: 'session-b' },
        };
        fireEvent.click(screen.getByText('Refresh official session'));
      }
      await screen.findByText(
        new RegExp(`搜索词：${network.session.session.id}`),
      );
      const newDialog = await openDisconnect();
      const sessionReads = client.getSession.mock.calls.length;
      const requests = vi.mocked(bilibiliRequest).mock.calls.length;
      await act(async () => {
        if (outcome === 'success') pending.resolve(view(false));
        else
          pending.reject(
            outcome === 'session-conflict'
              ? sessionConflict()
              : Object.assign(new Error(outcome), {
                  status: outcome === 'forbidden' ? 403 : 409,
                }),
          );
        await pending.promise.catch(() => {});
      });
      expect(client.getSession).toHaveBeenCalledTimes(sessionReads);
      expect(bilibiliRequest).toHaveBeenCalledTimes(requests);
      expect(screen.getByRole('alertdialog')).toBe(newDialog);
      expect(newDialog).toBeVisible();
      expect(
        screen.queryByText(/Session changed|session-conflict|forbidden/),
      ).toBeNull();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
      expect(changes).not.toHaveBeenCalled();

      // The new owner can still complete the exact confirmation that survived.
      await confirm(newDialog);
      expect(bilibiliRequest).toHaveBeenLastCalledWith(
        1,
        'disconnect',
        { revision: '641664cf-f741-4e91-b9dd-854b88ed1570' },
        network.session.session.id,
      );
      expect(changes).toHaveBeenCalledExactlyOnceWith(
        network.session.session.id,
      );
    },
  );
}

it('still refreshes the official provider for a session conflict while the initiating owner is active', async () => {
  const { client } = setup();
  const dialog = await openDisconnect();
  const reads = client.getSession.mock.calls.length;
  // Another tab changed the cookie; this provider has not refreshed yet.
  network.session = { user: { id: 'admin-b' }, session: { id: 'session-b' } };
  vi.mocked(bilibiliRequest).mockRejectedValueOnce(sessionConflict());
  await confirm(dialog);
  await screen.findByText(/搜索词：session-b/);
  expect(client.getSession).toHaveBeenCalledTimes(reads + 1);
  expect(screen.getByTestId('session')).toHaveTextContent('session-b');
  expect(changes).not.toHaveBeenCalled();
  await confirm(await openDisconnect());
  expect(changes).toHaveBeenCalledExactlyOnceWith('session-b');
});

it.each(['account', 'revision'] as const)(
  'aborts an unconfirmed dialog on %s replacement and ignores its retained button',
  async (change) => {
    const { authz } = setup();
    const oldDialog = await openDisconnect();
    const oldButton = within(oldDialog).getByRole('button', { name: '断开' });
    if (change === 'revision') act(() => authz.invalidate());
    else {
      network.session = {
        user: { id: 'admin-b' },
        session: { id: 'session-b' },
      };
      fireEvent.click(screen.getByText('Refresh official session'));
    }
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const dialog = await openDisconnect();
    fireEvent.click(oldButton);
    expect(screen.getByRole('alertdialog')).toBe(dialog);
    expect(
      vi
        .mocked(bilibiliRequest)
        .mock.calls.some(([, action]) => action === 'disconnect'),
    ).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(
      vi
        .mocked(bilibiliRequest)
        .mock.calls.some(([, action]) => action === 'disconnect'),
    ).toBe(false);
    await confirm(await openDisconnect());
    expect(changes).toHaveBeenCalledExactlyOnceWith(network.session.session.id);
  },
);
