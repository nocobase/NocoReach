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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api';
import { MeProvider, MemberGate } from '../../client/pages/me';
import { YouTubeConnect } from '../../client/pages/youtube-connect';
import {
  youtubeRequest,
  type YouTubeStatus,
} from '../../client/pages/youtube-api';
import { setDictionary } from '../../client/i18n';

// Only transport responses and their timing are controlled. Both official
// providers, useAuthentication(), membership ownership and dialogs are real.
const network = vi.hoisted(() => ({
  session: { user: { id: 'admin-a' }, session: { id: 'session-a' } },
}));
vi.mock('../../client/lib/nocoreach-api', async () => ({
  ...(await vi.importActual('../../client/lib/nocoreach-api')),
  nocobaseClient: {
    action: vi.fn(async () => ({
      id: network.session.user.id,
      name: 'Synthetic admin',
      role: 'admin',
    })),
    wrapRequests: vi.fn(),
  },
}));
vi.mock('../../client/pages/youtube-api', async () => ({
  ...(await vi.importActual('../../client/pages/youtube-api')),
  youtubeRequest: vi.fn(),
}));
const AuthorizationProvider = reactProviders[0].component;
const changes = vi.fn();
const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
function view(connected = true): YouTubeStatus {
  return {
    configured: connected,
    connected,
    syncing: false,
    runId: null,
    revision: '641664cf-f741-4e91-b9dd-854b88ed1570',
    terms: [network.session.session.id],
    videoUrls: [],
    autoSync: false,
    fetchedAt: null,
    page: 1,
    pageSize: 20,
    videos: [],
    total: 1,
    lastSync: null,
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
    <YouTubeConnect
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
              'nrYouTube.connect',
              'nrYouTube.sync',
              'nrYouTube.cancel',
              'nrYouTube.disconnect',
              'nrYouTube.clear',
            ],
          },
        ],
      },
    })),
  } as never);
  container.instance(authorizationClientToken, authz);
  const app = { services: container } as unknown as ClientApplication;
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queries}>
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
      </TestI18nProvider>
    </QueryClientProvider>,
  );
  return { client, authz };
}
async function openDisconnect() {
  fireEvent.click(await screen.findByRole('button', { name: '断开' }));
  return screen.findByRole('alertdialog');
}
async function openClear() {
  fireEvent.click(
    await screen.findByRole('button', { name: '清理已获取数据' }),
  );
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '继续确认',
    }),
  );
  return screen.findByRole('alertdialog', { name: '再次确认清理' });
}
async function confirm(dialog: HTMLElement) {
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: /^(断开|替换|确认清理)$/,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
}
async function openReplacement() {
  fireEvent.click(await screen.findByRole('button', { name: '修改' }));
  const field = await screen.findByRole('textbox', { name: 'YouTube 搜索词' });
  fireEvent.change(field, {
    target: { value: `Replacement ${network.session.session.id}` },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存并读取' }));
  return screen.findByRole('alertdialog');
}
const sessionConflict = () =>
  new NocoReachHttpError('Session changed', 409, {
    error: { reason: 'NOCOREACH_CONFIRMATION_SESSION_CHANGED' },
  });
beforeEach(() => {
  network.session = { user: { id: 'admin-a' }, session: { id: 'session-a' } };
  changes.mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warning).mockClear();
  setDictionary(null);
  vi.mocked(youtubeRequest)
    .mockReset()
    .mockImplementation(async (_project, action) =>
      view(action !== 'disconnect'),
    );
});
afterEach(async () => {
  await act(async () => cleanup());
});

for (const operation of ['disconnect', 'connect', 'clear'] as const) {
  const openIntent =
    operation === 'disconnect'
      ? openDisconnect
      : operation === 'clear'
        ? openClear
        : openReplacement;
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
      `ignores late ${operation} %s after ${transition} opens a new owner's confirmation`,
      async (outcome) => {
        const { client, authz } = setup();
        const oldDialog = await openIntent();
        const pending = Promise.withResolvers<YouTubeStatus>();
        vi.mocked(youtubeRequest).mockImplementationOnce(() => pending.promise);
        await confirm(oldDialog);
        await waitFor(() =>
          expect(youtubeRequest).toHaveBeenCalledWith(
            1,
            operation,
            expect.objectContaining({
              revision: '641664cf-f741-4e91-b9dd-854b88ed1570',
            }),
            undefined,
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
        await screen.findByText(network.session.session.id);
        const newDialog = await openIntent();
        const sessionReads = client.getSession.mock.calls.length;
        const requests = vi.mocked(youtubeRequest).mock.calls.length;
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
        expect(youtubeRequest).toHaveBeenCalledTimes(requests);
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
        expect(youtubeRequest).toHaveBeenLastCalledWith(
          1,
          operation,
          expect.objectContaining({
            revision: '641664cf-f741-4e91-b9dd-854b88ed1570',
          }),
          undefined,
          network.session.session.id,
        );
        expect(changes).toHaveBeenCalledExactlyOnceWith(
          network.session.session.id,
        );
      },
    );
  }
}

it('still refreshes the official provider for a session conflict while the initiating owner is active', async () => {
  const { client } = setup();
  const dialog = await openDisconnect();
  const reads = client.getSession.mock.calls.length;
  // Another tab changed the cookie; this provider has not refreshed yet.
  network.session = { user: { id: 'admin-b' }, session: { id: 'session-b' } };
  vi.mocked(youtubeRequest).mockRejectedValueOnce(sessionConflict());
  await confirm(dialog);
  await screen.findByText('session-b');
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
        .mocked(youtubeRequest)
        .mock.calls.some(([, action]) => action === 'disconnect'),
    ).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(
      vi
        .mocked(youtubeRequest)
        .mock.calls.some(([, action]) => action === 'disconnect'),
    ).toBe(false);
    await confirm(await openDisconnect());
    expect(changes).toHaveBeenCalledExactlyOnceWith(network.session.session.id);
  },
);
