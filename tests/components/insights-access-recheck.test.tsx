import {
  ClientApplicationContext,
  realtimeClientToken,
  type ClientApplication,
} from '@nocobase/app-client';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { reactProviders as authorizationProviders } from '@nocobase/app-plugin-authorization/client/react-providers';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
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
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionGenerationProvider } from '../../client/hooks/use-permission-generation';
import {
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import StrategyPage from '../../client/pages/strategy/index';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';
import { ClientRoute } from '../../client/routing/client-route';
import type {
  InsightBatch,
  Opportunity,
  StrategyState,
} from '../../shared/strategy-model';

// Insights behind the real route guard (ClientRoute and useCan), permission generation and workspace cache, with a
// realtime client that sends what a connection sends: an invalidation when it opens and when each permission topic is
// ready, permission-changed events, and drops.
const { authentication, action, tasks } = vi.hoisted(() => ({
  authentication: {
    session: { user: { id: 'one' }, session: { id: 'one-session' } } as {
      user: { id: string };
      session: { id: string };
    },
    isPending: false,
  },
  action: vi.fn(),
  tasks: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => authentication,
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({
    project: { id: 1, name: 'Test project', domains: [] },
  }),
  taskRecords: (id: number) => tasks(id),
  useUnsavedWarning: () => {},
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: 'one' }, mine: () => true, can: () => true }),
  taskOwner: () => 'one',
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
  useNavSources: () => null,
}));

const AuthorizationProvider = authorizationProviders[0].component;
const PAGE = 'growth-overview';
const allowed = {
  unrestricted: false,
  permissions: [{ resource: { type: 'page', id: PAGE }, actions: ['access'] }],
};
const denied = { unrestricted: false, permissions: [] };

const card = (id: string, title: string): Opportunity => ({
  id,
  title,
  observation: '',
  meaning: '',
  evidenceText: '',
  limitation: '',
  suggestion: '',
  objective: '',
  source: 'search',
  priority: 'high',
});
const batch = (items: Opportunity[], judge = false): InsightBatch => ({
  generatedAt: '2026-11-04T08:00:00Z',
  items,
  observations: [],
  evidence: {
    analysisVersion: 3,
    periodDays: 28,
    capturedAt: '',
    availableThrough: null,
    searchQueries: [],
    pages: [],
    industryCandidates: [],
    limitations: [],
    signals: {
      computedAt: '',
      coverage: {},
      missing: [],
      // A change no analysis judged yet: Insights asks the server to judge it once, then reads the state again.
      items: judge
        ? [
            {
              key: 'unjudged',
              type: 'change',
              source: 'gsc',
              title: 'Clicks moved',
              facts: [],
              strength: 1,
              actionable: false,
              action: null,
            },
          ]
        : [],
    },
  },
});
const stateWith = (
  titles: string[],
  { revision = 1, judge = false, ignored = [] as string[] } = {},
): StrategyState => ({
  revision,
  goal: null,
  proposals: [],
  insights: batch(
    titles.map((title, i) => card(`o${i}`, title)),
    judge,
  ),
  opportunityMeta: Object.fromEntries(
    ignored.map((id) => [id, { status: 'ignored' }]),
  ),
});

let server: StrategyState;
const stateReads: ((value: StrategyState) => void)[] = [];
let holdState = false;
let mounts = 0;

function Page() {
  useNocoReachLocale();
  useEffect(() => {
    mounts += 1;
  }, []);
  return <StrategyPage />;
}
const route: AppClientRegisteredRoute = {
  id: PAGE,
  name: PAGE,
  path: '/home',
  auth: 'required',
  authz: { resource: { type: 'page', id: PAGE }, action: 'access' },
  packageName: 'nocoreach',
  source: 'application',
  componentLoader: async () => ({ default: Page }),
};

function fakeRealtime() {
  const readies = new Set<() => void>();
  const states = new Set<(state: string) => void>();
  const events = new Map<string, Set<() => void>>();
  return {
    client: {
      ready: true,
      watch: (topic: string, { onEvent }: { onEvent: () => void }) => {
        const listeners = events.get(topic) ?? new Set<() => void>();
        listeners.add(onEvent);
        events.set(topic, listeners);
        return { close: () => listeners.delete(onEvent) };
      },
      onReady: (listener: () => void) => {
        readies.add(listener);
        return () => readies.delete(listener);
      },
      onStateChange: (listener: (state: string) => void) => {
        states.add(listener);
        return () => states.delete(listener);
      },
    },
    event: (topic: string) =>
      events.get(topic)?.forEach((listener) => listener()),
    ready: () => readies.forEach((listener) => listener()),
    state: (state: string) => states.forEach((listener) => listener(state)),
  };
}

let disconnect: (() => void) | undefined;
async function setup() {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  const realtime = fakeRealtime();
  const snapshot = { value: allowed as unknown };
  const permissions = vi.fn(async () => ({
    data: structuredClone(snapshot.value),
  }));
  const container = new ServiceContainer();
  const authz = new AuthorizationClient({ request: permissions } as never);
  container.instance(authorizationClientToken, authz);
  container.instance(realtimeClientToken, realtime.client);
  const app = { services: container } as unknown as ClientApplication;
  let visible = true;
  const tree = () => (
    <I18nProvider runtime={runtime}>
      <ClientApplicationContext.Provider value={app}>
        <MemoryRouter>
          <AuthorizationProvider>
            <PermissionGenerationProvider>
              <WorkspaceCacheProvider>
                {visible && <ClientRoute route={route} />}
              </WorkspaceCacheProvider>
            </PermissionGenerationProvider>
          </AuthorizationProvider>
        </MemoryRouter>
      </ClientApplicationContext.Provider>
    </I18nProvider>
  );
  const view = render(tree());
  return {
    authz,
    realtime,
    snapshot,
    permissions,
    rerender: () => view.rerender(tree()),
    // Leaving the page and opening it again, in the same session cache.
    show(next: boolean) {
      visible = next;
      view.rerender(tree());
    },
    // A permissions read that does not answer yet, to look at the page while its check is pending.
    holdPermissions() {
      const held = Promise.withResolvers<void>();
      permissions.mockImplementation(async () => {
        await held.promise;
        return { data: structuredClone(snapshot.value) };
      });
      return () => {
        permissions.mockImplementation(async () => ({
          data: structuredClone(snapshot.value),
        }));
        held.resolve();
      };
    },
  };
}
type View = Awaited<ReturnType<typeof setup>>;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
// What a requested reconnect sends with the permissions unchanged: an invalidation when the connection opens, the
// connection's ready, and an invalidation when each permission topic is ready.
async function reconnect(view: View) {
  await act(async () => {
    view.authz.invalidate();
    view.realtime.ready();
    view.authz.invalidate();
    view.authz.invalidate();
  });
}
const calls = (resource: string, operation: string) =>
  action.mock.calls.filter(([r, o]) => r === resource && o === operation)
    .length;
const stateCalls = () => calls('nrStrategy', 'state');
const opportunity = (title: string) =>
  screen.queryByRole('listitem', { name: title });
const pageShown = () =>
  screen.findByRole('button', { name: 'Update analysis' }, { timeout: 5000 });
// Nothing of the page and none of its actions: only the route's loading or denied screen.
function expectNoPage() {
  expect(screen.queryByRole('button', { name: 'Update analysis' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Ignore' })).toBeNull();
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  expect(screen.queryByText('Insights')).toBeNull();
}
// The next state read waits until it is answered by hand.
function holdNextState() {
  holdState = true;
  return {
    answer: async (value: StrategyState) => {
      await act(async () => {
        stateReads.shift()!(value);
      });
    },
  };
}

beforeEach(() => {
  sessionStorage.clear();
  setDictionary(null);
  mounts = 0;
  holdState = false;
  stateReads.length = 0;
  authentication.session = {
    user: { id: 'one' },
    session: { id: 'one-session' },
  };
  server = stateWith(['Opportunity B', 'Opportunity C']);
  tasks.mockReset().mockResolvedValue([]);
  action
    .mockReset()
    .mockImplementation(
      async (
        resource: string,
        operation: string,
        options: { body: Record<string, unknown> },
      ) => {
        if (resource === 'nrStrategy' && operation === 'state') {
          if (!holdState) return structuredClone(server);
          holdState = false;
          return new Promise<StrategyState>((resolve) =>
            stateReads.push(resolve),
          );
        }
        if (resource === 'nrStrategy' && operation === 'reviewOpportunity') {
          const id = String(options.body.insightId);
          server = {
            ...server,
            revision: server.revision + 1,
            opportunityMeta: {
              ...server.opportunityMeta,
              [id]: { status: String(options.body.status) },
            },
          };
          return structuredClone(server);
        }
        if (resource === 'nrAnalysis' && operation === 'judgeMissing') {
          server = {
            ...server,
            insights: server.insights && {
              ...server.insights,
              signalReviews: {
                unjudged: { verdict: 'skip', reason: '', at: '' },
              },
            },
          } as StrategyState;
          return { judged: 1 };
        }
        if (resource === 'nrAnalysis')
          return { running: false, last: null, runs: [], schedule: null };
        if (resource === 'nrPlaybooks') return { revision: 1, playbooks: [] };
        if (resource === 'nrDataViews') return { cards: [] };
        if (resource === 'nrInsights') return { areas: [] };
        throw new Error(`Unexpected request ${resource}/${operation}`);
      },
    );
});
afterEach(() => {
  cleanup();
  disconnect?.();
  setDictionary(null);
  vi.restoreAllMocks();
});

describe('Insights behind an access re-check', () => {
  it('hides the page and every action while a re-check is pending', async () => {
    const view = await setup();
    await pageShown();
    const release = view.holdPermissions();
    await reconnect(view);
    expect(screen.getByText('Loading page')).toBeVisible();
    expectNoPage();
    release();
    await pageShown();
    expect(opportunity('Opportunity B')).not.toBeNull();
  });

  it('remounts after a re-check with the same snapshot and takes the state it read rather than reading it again', async () => {
    const view = await setup();
    await pageShown();
    await waitFor(() => expect(tasks).toHaveBeenCalledTimes(1));
    expect(mounts).toBe(1);
    expect(stateCalls()).toBe(1);
    await reconnect(view);
    await pageShown();
    await settle();
    // The route guard still unmounts the page while it checks again.
    expect(mounts).toBe(2);
    expect(stateCalls()).toBe(1);
    expect(calls('nrInsights', 'summary')).toBe(1);
    expect(tasks).toHaveBeenCalledTimes(1);
    expect(opportunity('Opportunity B')).not.toBeNull();
  });

  it('takes the same reads through each re-check when the connection opens and its topics become ready one by one', async () => {
    const view = await setup();
    await pageShown();
    await waitFor(() => expect(tasks).toHaveBeenCalledTimes(1));
    for (const round of [1, 2, 3]) {
      await act(async () => {
        view.authz.invalidate();
        if (round === 1) view.realtime.ready();
      });
      await waitFor(() => expect(mounts).toBe(round + 1));
      await pageShown();
    }
    await settle();
    expect(stateCalls()).toBe(1);
    expect(calls('nrInsights', 'summary')).toBe(1);
    expect(tasks).toHaveBeenCalledTimes(1);
  });

  it('joins the state read still in flight when a re-check remounts the page', async () => {
    const read = holdNextState();
    const view = await setup();
    await waitFor(() => expect(stateCalls()).toBe(1));
    await reconnect(view);
    await waitFor(() => expect(mounts).toBe(2));
    await settle();
    expect(stateCalls()).toBe(1);
    await read.answer(structuredClone(server));
    await pageShown();
    expect(stateCalls()).toBe(1);
    expect(calls('nrInsights', 'summary')).toBe(1);
  });

  it('reads the state again when the page is opened again, also right after a re-check took the earlier read', async () => {
    const view = await setup();
    await pageShown();
    view.show(false);
    view.show(true);
    await pageShown();
    await settle();
    expect(stateCalls()).toBe(2);
    await reconnect(view);
    await pageShown();
    await settle();
    expect(stateCalls()).toBe(2);
    // The re-check's hand-over is used once: opening the page again reads it again.
    view.show(false);
    view.show(true);
    await pageShown();
    await settle();
    expect(stateCalls()).toBe(3);
  });

  it('reads the state again when the re-check answers after the reuse window', async () => {
    const view = await setup();
    await pageShown();
    const release = view.holdPermissions();
    await reconnect(view);
    const later = Date.now() + 11_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    release();
    await pageShown();
    await settle();
    expect(stateCalls()).toBe(2);
  });

  it('shows the state after a mutation when a re-check remounts the page', async () => {
    const view = await setup();
    await pageShown();
    fireEvent.click(
      within(opportunity('Opportunity B')!).getByRole('button', {
        name: 'Ignore',
      }),
    );
    await screen.findByText('Dismissed 1');
    await reconnect(view);
    await pageShown();
    expect(screen.getByText('Dismissed 1')).toBeInTheDocument();
    // The mutation's answer is what the remounted page took.
    expect(stateCalls()).toBe(1);
  });

  it('never shows a state read that started before a mutation and answered after it, before or after a remount', async () => {
    server = stateWith(['Opportunity B', 'Opportunity C'], { judge: true });
    const view = await setup();
    await pageShown();
    // The judgement of the unjudged change reads the state again; that read is held.
    const read = holdNextState();
    await waitFor(() => expect(stateCalls()).toBe(2));
    const before = structuredClone(server);
    fireEvent.click(
      within(opportunity('Opportunity B')!).getByRole('button', {
        name: 'Ignore',
      }),
    );
    await screen.findByText('Dismissed 1');
    await read.answer(before);
    await settle();
    expect(screen.getByText('Dismissed 1')).toBeInTheDocument();
    await reconnect(view);
    await pageShown();
    expect(screen.getByText('Dismissed 1')).toBeInTheDocument();
    expect(stateCalls()).toBe(2);
    expect(calls('nrAnalysis', 'judgeMissing')).toBe(1);
  });
});

describe('Insights when permissions or the session change', () => {
  it('a permission change hides the page while pending, then denies it; a late read of the old permissions is never shown', async () => {
    const read = holdNextState();
    const view = await setup();
    await waitFor(() => expect(stateCalls()).toBe(1));
    view.snapshot.value = denied;
    const release = view.holdPermissions();
    await act(async () => {
      view.realtime.event('authorization:permissions-changed');
      view.authz.invalidate();
    });
    expect(screen.getByText('Loading page')).toBeVisible();
    expectNoPage();
    release();
    await screen.findByText('Access denied');
    expectNoPage();
    await read.answer(stateWith(['Old permissions opportunity']));
    await settle();
    expect(screen.queryByText('Old permissions opportunity')).toBeNull();

    // Allowed again: a snapshot that differs moves the generation once more, and the page reads its state afresh.
    server = stateWith(['New permissions opportunity']);
    view.snapshot.value = allowed;
    await act(async () => {
      view.authz.invalidate();
    });
    await pageShown();
    expect(stateCalls()).toBe(2);
    expect(opportunity('New permissions opportunity')).not.toBeNull();
    expect(screen.queryByText('Old permissions opportunity')).toBeNull();
  });

  it('nothing read for one user reaches the next', async () => {
    server = stateWith(['First user opportunity'], { judge: true });
    const view = await setup();
    await pageShown();
    // The first user's judgement reads the state again; that read is still in flight when the other user signs in.
    const read = holdNextState();
    await waitFor(() => expect(stateCalls()).toBe(2));
    const first = structuredClone(server);
    server = stateWith(['Second user opportunity']);
    authentication.session = {
      user: { id: 'two' },
      session: { id: 'two-session' },
    };
    view.rerender();
    await pageShown();
    expect(opportunity('Second user opportunity')).not.toBeNull();
    expect(screen.queryByText('First user opportunity')).toBeNull();
    // The second user's own read, not the first user's cached one.
    expect(stateCalls()).toBe(3);
    await read.answer(first);
    await settle();
    expect(screen.queryByText('First user opportunity')).toBeNull();
    // A re-check for the second user takes the second user's state.
    await reconnect(view);
    await pageShown();
    expect(opportunity('Second user opportunity')).not.toBeNull();
    expect(screen.queryByText('First user opportunity')).toBeNull();
    expect(stateCalls()).toBe(3);
  });

  it('a connection ready again after a drop hides the page while pending and drops what was read; a late read never refills it', async () => {
    const read = holdNextState();
    const view = await setup();
    await waitFor(() => expect(stateCalls()).toBe(1));
    const release = view.holdPermissions();
    await act(async () => {
      view.realtime.state('reconnecting');
      view.realtime.ready();
      view.authz.invalidate();
    });
    expect(screen.getByText('Loading page')).toBeVisible();
    expectNoPage();
    server = stateWith(['After the drop']);
    release();
    await pageShown();
    // A new read, not the one in flight before the drop.
    expect(stateCalls()).toBe(2);
    expect(opportunity('After the drop')).not.toBeNull();
    await read.answer(stateWith(['Before the drop']));
    await settle();
    expect(screen.queryByText('Before the drop')).toBeNull();
    // The new cache holds the new read: a re-check takes it.
    await reconnect(view);
    await pageShown();
    expect(opportunity('After the drop')).not.toBeNull();
    expect(screen.queryByText('Before the drop')).toBeNull();
    expect(stateCalls()).toBe(2);
  });

  it('a re-read snapshot that differs but still allows reads the page afresh, mounted once, in the new generation', async () => {
    const view = await setup();
    await pageShown();
    view.snapshot.value = {
      ...allowed,
      permissions: [
        ...allowed.permissions,
        {
          resource: { type: 'page', id: 'analysis-rules' },
          actions: ['access'],
        },
      ],
    };
    await act(async () => {
      view.authz.invalidate();
    });
    await pageShown();
    await settle();
    expect(mounts).toBe(2);
    expect(stateCalls()).toBe(2);
    // Within the new generation a re-check hands over again.
    await reconnect(view);
    await pageShown();
    await settle();
    expect(stateCalls()).toBe(2);
  });

  it('a failed permission read denies the page and drops what was read', async () => {
    const view = await setup();
    await pageShown();
    view.permissions.mockRejectedValue(new Error('offline'));
    await act(async () => {
      view.authz.invalidate();
    });
    await screen.findByText('Access denied');
    expectNoPage();
    view.permissions.mockImplementation(async () => ({
      data: structuredClone(view.snapshot.value),
    }));
    await act(async () => {
      view.authz.invalidate();
    });
    await pageShown();
    expect(stateCalls()).toBe(2);
  });
});
