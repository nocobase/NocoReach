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
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MeProvider, MemberGate } from '../../client/pages/me';
import {
  XiaohongshuConnect,
  type XiaohongshuView,
} from '../../client/pages/xiaohongshu-connect';
import { xiaohongshuRequest } from '../../client/pages/xiaohongshu-api';
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
vi.mock('../../client/pages/xiaohongshu-api', () => ({
  xiaohongshuRequest: vi.fn(),
}));
const AuthorizationProvider = reactProviders[0].component;
const changes = vi.fn();
function view(connected = true): XiaohongshuView {
  return {
    connected,
    revision: 7,
    configured: true,
    collectorId: 'qa',
    collectors: [{ id: 'qa', name: 'Synthetic collector' }],
    query: network.session.session.id,
    verifiedAt: null,
    lastRun: null,
    total: 0,
    running: null,
    notes: [],
    latestIds: [],
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
    <XiaohongshuConnect
      projectId={1}
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
              'nrXiaohongshu.connect',
              'nrXiaohongshu.test',
              'nrXiaohongshu.search',
              'nrXiaohongshu.cancel',
              'nrXiaohongshu.disconnect',
            ],
          },
        ],
      },
    })),
  } as never);
  container.instance(authorizationClientToken, authz);
  const app = { services: container } as unknown as ClientApplication;
  render(
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
    </ClientApplicationContext.Provider>,
  );
  return { client, authz };
}
async function openDisconnect() {
  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: '断开' }));
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
  setDictionary(null);
  vi.mocked(xiaohongshuRequest)
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
      const pending = Promise.withResolvers<XiaohongshuView>();
      vi.mocked(xiaohongshuRequest).mockImplementationOnce(
        () => pending.promise,
      );
      await confirm(oldDialog);
      await waitFor(() =>
        expect(xiaohongshuRequest).toHaveBeenCalledWith(
          1,
          'disconnect',
          { revision: 7 },
          'session-a',
        ),
      );

      if (transition === 'permission-revision') act(() => authz.invalidate());
      else {
        network.session = {
          user: { id: transition === 'new-account' ? 'admin-b' : 'admin-a' },
          session: { id: 'session-b' },
        };
        fireEvent.click(
          screen.getByRole('button', { name: 'Refresh official session' }),
        );
      }
      await screen.findByText(`搜索词：${network.session.session.id}`);
      const newDialog = await openDisconnect();
      const sessionReads = client.getSession.mock.calls.length;
      const requests = vi.mocked(xiaohongshuRequest).mock.calls.length;
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
      expect(xiaohongshuRequest).toHaveBeenCalledTimes(requests);
      expect(screen.getByRole('alertdialog')).toBe(newDialog);
      expect(newDialog).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(changes).not.toHaveBeenCalled();

      // The new owner can still complete the exact confirmation that survived.
      await confirm(newDialog);
      expect(xiaohongshuRequest).toHaveBeenLastCalledWith(
        1,
        'disconnect',
        { revision: 7 },
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
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(sessionConflict());
  await confirm(dialog);
  await screen.findByText('搜索词：session-b');
  expect(client.getSession).toHaveBeenCalledTimes(reads + 1);
  expect(screen.getByTestId('session')).toHaveTextContent('session-b');
  expect(changes).not.toHaveBeenCalled();
  await confirm(await openDisconnect());
  expect(changes).toHaveBeenCalledExactlyOnceWith('session-b');
});
