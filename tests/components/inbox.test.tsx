import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { TooltipProvider } from '../../client/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'user-1' } } as { user: { id: string } } | null,
  unread: 2,
  request: vi.fn(),
  action: vi.fn(),
  notices: [] as unknown[],
  canAct: true,
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action: mocks.action, wrapRequests: () => undefined },
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({
    me: { id: 'user-1', name: 'Lin', role: 'member' },
    can: () => mocks.canAct,
  }),
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ session: mocks.session, isPending: false }),
}));
vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  const client = { request: mocks.request };
  const realtime = {
    subscribe: () => vi.fn(),
    onOpen: () => vi.fn(),
    watch: () => ({ close: vi.fn() }),
  };
  return {
    ...actual,
    useApiClient: () => client,
    // The inbox waits for its topics to be acknowledged; the hook resolves the realtime client from the application.
    useRealtimeReadiness: () => true,
    useService: (token: unknown) =>
      token === actual.realtimeClientToken ? realtime : client,
  };
});

import { InboxHeaderButton } from '../../client/components/inbox-header-button.tsx';
import InboxPage from '../../client/pages/inbox.tsx';

const messages = [
  {
    id: 'm1',
    deliveryId: 'd1',
    notificationId: 'n1',
    title: 'Weekly report is ready',
    body: 'The sales report for week 40 is ready.',
    createdAt: '2026-10-01T08:00:00.000Z',
  },
  {
    id: 'm2',
    deliveryId: 'd2',
    notificationId: 'n2',
    title: 'Backup finished',
    body: 'All databases were backed up.',
    readAt: '2026-10-01T09:00:00.000Z',
    createdAt: '2026-10-01T07:00:00.000Z',
  },
];

// A task waiting for review, and a failed daily analysis, as NocoReach sends them.
const noticed = [
  {
    id: 'm3',
    deliveryId: 'd3',
    notificationId: 'n3',
    title: 'T-55 waits for you: Review draft',
    body: 'Rewrite the pricing page intro',
    target: { type: 'route', path: '/actions/12' },
    createdAt: '2026-10-02T08:00:00.000Z',
  },
  {
    id: 'm4',
    deliveryId: 'd4',
    notificationId: 'n4',
    title: "Today's daily analysis did not finish",
    body: 'Acme: the online AI could not be reached.\nOpen Insights and choose Analyze again.',
    target: { type: 'route', path: '/home' },
    readAt: '2026-10-02T07:30:00.000Z',
    createdAt: '2026-10-02T07:00:00.000Z',
  },
];
const waitingNotice = {
  notificationId: 'n3',
  type: 'task.waiting',
  task: { id: '12', projectId: '1', label: 'T-55', resolvedAt: null },
};
const task = {
  task: {
    id: 12,
    title: 'Rewrite the pricing page intro',
    evidence: { no: 55 },
    status: 'Needs you',
  },
  work: {
    revision: 4,
    stage: 'flow',
    stageIndex: 1,
    flow: {
      id: 'custom',
      name: 'Custom',
      version: 1,
      stages: [
        { key: 'draft', kind: 'agent', name: 'Write the draft' },
        { key: 'check', kind: 'review', name: 'Review draft' },
      ],
    },
    results: [
      {
        id: 'a1',
        content:
          '## Draft\n\nA **shorter** intro that names the free plan first.',
      },
    ],
    history: [
      {
        at: '2026-10-02T07:00:00.000Z',
        actor: '3',
        action: 'comment',
        comment: 'Keep the second paragraph short.',
      },
    ],
    humanOwnerId: 'user-1',
    humanOwnerName: 'Lin',
  },
  runs: [],
  artifacts: [],
  reviews: [],
};

let runtime: I18nRuntime;
beforeEach(async () => {
  mocks.session = { user: { id: 'user-1' } };
  mocks.unread = 2;
  // NocoReach's own wording (`$t`) in English, as the runtime below.
  setDictionary(english, 'en-US');
  mocks.notices = [];
  mocks.canAct = true;
  mocks.action.mockReset();
  mocks.action.mockImplementation(async (_resource: string, action: string) =>
    action === 'members' ? [{ id: '3', name: 'Mia' }] : task,
  );
  mocks.request.mockReset();
  mocks.request.mockImplementation(
    async ({ path }: { readonly path: string }) => {
      if (path.endsWith('/unreadCount'))
        return { data: { count: mocks.unread } };
      if (path.startsWith('notificationInApp/messages?'))
        return { data: mocks.notices.length ? noticed : messages, meta: {} };
      if (path.startsWith('nocoreachInbox/notices?'))
        return { data: mocks.notices };
      return { data: { ...messages[0], readAt: '2026-10-01T10:00:00.000Z' } };
    },
  );
  runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init('en-US');
});

function Frame({
  children,
  path,
}: {
  readonly children: ReactElement;
  readonly path: string;
}): ReactElement {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <I18nProvider runtime={runtime}>
          <TooltipProvider>{children}</TooltipProvider>
        </I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

it('links the header to the inbox with the unread count, for a signed-in person only', async () => {
  const view = render(
    <Frame path='/'>
      <InboxHeaderButton />
    </Frame>,
  );
  const link = await screen.findByRole('link', { name: 'Inbox, 2 unread' });
  expect(link).toHaveAttribute('href', '/inbox');
  expect(screen.getByText('2')).toBeInTheDocument();
  mocks.session = null;
  view.rerender(
    <Frame path='/'>
      <InboxHeaderButton />
    </Frame>,
  );
  expect(screen.queryByRole('link')).toBeNull();
});

it("lists the plugin's messages as notifications and marks one read when it is opened", async () => {
  render(
    <Frame path='/inbox'>
      <InboxPage />
    </Frame>,
  );
  expect(
    await screen.findByRole('heading', { name: /Notifications/u }),
  ).toBeInTheDocument();
  expect(screen.getByText('Backup finished')).toBeInTheDocument();
  // The first message is shown, and opening it marks it read.
  expect(
    screen.getByRole('heading', { name: 'Weekly report is ready', level: 2 }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getAllByText('Weekly report is ready')[0]!);
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'notificationInApp/messages/m1/markRead',
      method: 'POST',
    }),
  );
});

it('shows a task waiting for review with its status, step, owner, output and comments, and what can be done', async () => {
  mocks.notices = [
    waitingNotice,
    { notificationId: 'n4', type: 'analysisFailed', task: null },
  ];
  render(
    <Frame path='/inbox'>
      <InboxPage />
    </Frame>,
  );
  expect(
    await screen.findByRole('heading', { name: /Needs my decision/u }),
  ).toBeInTheDocument();
  expect(await screen.findByText('Review draft')).toBeInTheDocument();
  expect(mocks.action).toHaveBeenCalledWith('nrTaskWork', 'get', {
    method: 'POST',
    body: { projectId: '1', taskId: '12' },
    unwrap: 'data',
  });
  expect(screen.getByText('Waiting for your review')).toBeInTheDocument();
  expect(screen.getByText('Lin')).toBeInTheDocument();
  expect(
    screen.getByText('A shorter intro that names the free plan first.', {
      exact: false,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Keep the second paragraph short.'),
  ).toBeInTheDocument();
  expect(await screen.findByText('Mia')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Snooze…' })).toBeInTheDocument();
  expect(document.querySelector('[data-action="read"]')).toHaveTextContent(
    'Mark as read',
  );
});

it('offers Mark as read on an unread task message', async () => {
  mocks.notices = [waitingNotice];
  render(
    <Frame path='/inbox?item=m3'>
      <InboxPage />
    </Frame>,
  );
  const button = await screen.findByRole('button', { name: 'Mark as read' });
  mocks.request.mockClear();
  fireEvent.click(button);
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'notificationInApp/messages/m3/markRead',
      method: 'POST',
    }),
  );
});

it('says why someone who cannot act on the task gets no buttons', async () => {
  mocks.notices = [waitingNotice];
  mocks.canAct = false;
  render(
    <Frame path='/inbox?item=m3'>
      <InboxPage />
    </Frame>,
  );
  expect(
    await screen.findByText(
      'Only Lin or an admin can review or snooze this task.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
  expect(screen.getByText('Review draft')).toBeInTheDocument();
});

it('reads as handled once the task was reviewed, and a task that cannot be opened says so', async () => {
  mocks.notices = [
    {
      ...waitingNotice,
      task: { ...waitingNotice.task, resolvedAt: '2026-10-03T08:00:00.000Z' },
    },
  ];
  mocks.action.mockRejectedValue(
    new (await import('../../client/lib/nocoreach-api')).NocoReachHttpError(
      'Forbidden',
      403,
      null,
    ),
  );
  render(
    <Frame path='/inbox?item=m3'>
      <InboxPage />
    </Frame>,
  );
  expect(await screen.findByText('Handled')).toBeInTheDocument();
  expect(
    await screen.findByText("You don't have access to this task."),
  ).toBeInTheDocument();
});

it('shows the whole text of another NocoReach message, such as a failed analysis', async () => {
  mocks.notices = [
    { notificationId: 'n4', type: 'analysisFailed', task: null },
  ];
  render(
    <Frame path='/inbox?item=m4'>
      <InboxPage />
    </Frame>,
  );
  // The detail is made anew once the message's notice arrives, so it is looked up again.
  await waitFor(() =>
    expect(
      within(screen.getByTestId('nocobase-inbox-detail')).getByText(
        'Analysis failed',
      ),
    ).toBeInTheDocument(),
  );
  const detail = screen.getByTestId('nocobase-inbox-detail');
  const body = within(detail).getByText(/the online AI could not be reached/u);
  expect(body.textContent).toBe(
    'Acme: the online AI could not be reached.\nOpen Insights and choose Analyze again.',
  );
});
