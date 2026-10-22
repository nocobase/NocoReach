import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { SiteContentConnect } from '../../client/pages/site-content-connect';
import { CommunityConnect } from '../../client/pages/community-connect';
import { PackagesConnect } from '../../client/pages/packages-connect';
import { HackerNewsConnect } from '../../client/pages/hackernews-connect';
import { RedditConnect } from '../../client/pages/reddit-connect';
import { TrendsConnect } from '../../client/pages/trends-connect';
import { XConnect } from '../../client/pages/x-connect';
import { ChatConnect } from '../../client/pages/chat-connect';
import {
  CompetitorsConnect,
  CompetitorWatchTab,
} from '../../client/pages/competitor-watch';

const state = vi.hoisted(() => ({
  action: vi.fn(),
  authorization: { can: vi.fn(), invalidate: vi.fn() },
  actions: [] as string[],
  responses: new Map<string, object>(),
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action: state.action, wrapRequests: vi.fn() },
}));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<object>()),
  useAuthorizationClient: () => state.authorization,
  useAuthorizationRevision: () => 'test-revision',
}));
vi.mock('../../client/pages/workspace-cache', () => ({
  useWorkspaceCache: () => ({ invalidate: vi.fn() }),
}));
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: vi.fn(async () => true),
}));
vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const onChange = vi.fn();
const run = { at: '2026-10-16T00:00:00Z', ok: true, errors: [], read: 0 };
const connected = {
  connected: true,
  terms: ['NocoBase'],
  lastSync: run,
  lastRun: run,
  dataforseo: true,
  total: 0,
};
const competitor = {
  id: 'retool',
  name: 'Retool',
  site: '',
  repo: 'retool/retool',
  addedAt: run.at,
  checkedAt: run.at,
  pages: 0,
  stars: 10,
  week: 0,
  latestRelease: null,
  errors: [],
};
const competitors = {
  connected: true,
  max: 5,
  suggestions: [],
  lastRun: run,
  nextCheckAt: null,
  list: [competitor],
  events: [],
  notes: [],
};
beforeEach(() => {
  setDictionary(english);
  state.actions = [];
  state.responses.clear();
  state.authorization.can.mockReset();
  state.authorization.can.mockImplementation(
    async ({
      resource,
      action,
    }: {
      resource: { id: string };
      action: string;
    }) => resource.id === '7' && state.actions.includes(action),
  );
  state.action.mockReset();
  state.action.mockImplementation(async (resource: string, action: string) => {
    const response =
      state.responses.get(`${resource}.${action}`) ??
      state.responses.get(resource);
    if (!response) throw new Error(`Unexpected call: ${resource}.${action}`);
    return response;
  });
  onChange.mockReset();
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});

const connectedCases = [
  {
    resource: 'nrCommunity',
    action: 'sync',
    label: 'Sync now',
    element: <CommunityConnect projectId={7} onChange={onChange} />,
    response: {
      ...connected,
      title: 'Community',
      origin: 'https://forum.example.test',
    },
  },
  {
    resource: 'nrPackages',
    action: 'sync',
    label: 'Sync now',
    element: <PackagesConnect projectId={7} onChange={onChange} />,
    response: {
      ...connected,
      packages: [
        {
          id: 'npm:test',
          registry: 'npm',
          registryName: 'npm',
          name: 'test',
          title: 'test',
          url: 'https://www.npmjs.com/package/test',
          downloads28: 0,
        },
      ],
    },
  },
  {
    resource: 'nrHackerNews',
    action: 'sync',
    label: 'Sync now',
    element: <HackerNewsConnect projectId={7} onChange={onChange} />,
    response: connected,
  },
  {
    resource: 'nrReddit',
    action: 'check',
    label: 'Search now',
    element: <RedditConnect projectId={7} onChange={onChange} />,
    response: connected,
  },
  {
    resource: 'nrTrends',
    action: 'check',
    label: 'Check now',
    element: <TrendsConnect projectId={7} onChange={onChange} />,
    response: { ...connected, locations: [], place: 'Worldwide' },
  },
  {
    resource: 'nrX',
    action: 'check',
    label: 'Search now',
    element: <XConnect projectId={7} onChange={onChange} />,
    response: {
      ...connected,
      spend: { usd: 0, posts: 0, requests: 0 },
      cap: 5,
      tokenSaved: true,
    },
  },
  {
    resource: 'nrChat',
    action: 'sync',
    label: 'Read now',
    element: <ChatConnect projectId={7} platform='slack' onChange={onChange} />,
    response: {
      ...connected,
      slack: {
        connected: true,
        tokenSaved: true,
        name: 'Workspace',
        bot: 'Bot',
        channels: [],
        lastRun: run,
      },
      discord: { connected: false, tokenSaved: false },
    },
  },
];
test.each(connectedCases)(
  '$resource / $action leaves other connection controls unavailable',
  async ({ resource, action, label, element, response }) => {
    state.actions = [`${resource}.${action}`];
    state.responses.set(resource, response);
    const user = userEvent.setup();
    const { container } = render(element);
    const allowed = await screen.findByRole('button', { name: label });
    expect(screen.getAllByRole('button')).toEqual([allowed]);
    expect(container.querySelector('input, select')).toBeNull();
    await user.click(allowed);
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(
      state.action.mock.calls.filter(([, operation]) => operation !== 'status'),
    ).toEqual([
      [
        resource,
        action,
        expect.objectContaining({
          body: expect.objectContaining({ projectId: 7 }),
        }),
      ],
    ]);
  },
);

test.each([
  {
    resource: 'nrCommunity',
    element: <CommunityConnect projectId={7} onChange={onChange} />,
    response: { connected: false },
  },
  {
    resource: 'nrPackages',
    element: <PackagesConnect projectId={7} onChange={onChange} />,
    response: { connected: false, packages: [] },
  },
  {
    resource: 'nrHackerNews',
    element: <HackerNewsConnect projectId={7} onChange={onChange} />,
    response: { connected: false },
  },
  {
    resource: 'nrReddit',
    element: <RedditConnect projectId={7} onChange={onChange} />,
    response: { connected: false, dataforseo: true },
  },
  {
    resource: 'nrTrends',
    element: <TrendsConnect projectId={7} onChange={onChange} />,
    response: { connected: false, dataforseo: true, locations: [] },
  },
  {
    resource: 'nrX',
    element: <XConnect projectId={7} onChange={onChange} />,
    response: { connected: false, tokenSaved: false },
  },
  {
    resource: 'nrChat',
    element: (
      <ChatConnect projectId={7} platform='discord' onChange={onChange} />
    ),
    response: {
      discord: { connected: false, tokenSaved: false },
      slack: { connected: false, tokenSaved: false },
    },
  },
])(
  '$resource hides setup inputs when only another action is granted',
  async ({ resource, element, response }) => {
    state.actions = [`${resource}.disconnect`];
    state.responses.set(resource, response);
    const { container } = render(element);
    await screen.findByText('Not connected yet');
    expect(container.querySelector('input, select, button')).toBeNull();
    expect(state.action.mock.calls.map(([, operation]) => operation)).toEqual([
      'status',
    ]);
  },
);

test('website discovery does not grant confirmation or removal', async () => {
  state.actions = ['nrSiteContent.discover'];
  state.responses.set('nrSiteContent.summary', { pages: 0, sites: [] });
  state.responses.set('nrSiteContent.discover', {
    origin: 'https://example.test',
    sitemaps: [],
    types: { docs: 3 },
    warnings: [],
    total: 3,
    samples: {},
    previewId: 'preview',
  });
  const user = userEvent.setup();
  render(<SiteContentConnect projectId={7} onChange={onChange} />);
  await user.type(
    await screen.findByRole('textbox', { name: 'Website URL' }),
    'https://example.test',
  );
  await user.click(screen.getByRole('button', { name: 'Read website' }));
  expect(await screen.findByRole('checkbox')).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Confirm and connect' }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  expect(state.action.mock.calls.map(([, operation]) => operation)).toEqual([
    'summary',
    'discover',
  ]);
});

test('website removal keeps saved content readable without discovery controls', async () => {
  state.actions = ['nrSiteContent.remove'];
  state.responses.set('nrSiteContent', {
    pages: 3,
    sites: [
      {
        origin: 'https://example.test',
        pages: 3,
        types: { docs: 3 },
        warnings: [],
      },
    ],
  });
  const user = userEvent.setup();
  render(<SiteContentConnect projectId={7} onChange={onChange} />);
  expect(await screen.findByText('https://example.test')).toBeVisible();
  const remove = await screen.findByRole('button', { name: 'Remove' });
  expect(screen.getAllByRole('button')).toEqual([remove]);
  await user.click(remove);
  await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
  expect(state.action.mock.calls.map(([, operation]) => operation)).toEqual([
    'summary',
    'remove',
  ]);
});

test('Chat inspection may list channels but cannot select or connect them', async () => {
  state.actions = ['nrChat.inspect'];
  state.responses.set('nrChat.status', {
    discord: { connected: false, tokenSaved: false },
    slack: { connected: false, tokenSaved: false },
  });
  state.responses.set('nrChat.inspect', {
    platform: 'discord',
    bot: 'Bot',
    guildId: 'one',
    guilds: [
      { id: 'one', name: 'First' },
      { id: 'two', name: 'Second' },
    ],
    channels: [{ id: 'general', name: 'general', kind: 'text' }],
  });
  const user = userEvent.setup();
  render(<ChatConnect projectId={7} platform='discord' onChange={onChange} />);
  await user.type(
    await screen.findByLabelText('Discord token'),
    'synthetic-token',
  );
  await user.click(screen.getByRole('button', { name: 'Check', exact: true }));
  expect(await screen.findByRole('checkbox')).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Connect', exact: true }),
  ).toBeNull();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Server' }),
    'two',
  );
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrChat',
      'inspect',
      expect.objectContaining({
        body: {
          projectId: 7,
          platform: 'discord',
          token: 'synthetic-token',
          guildId: 'two',
        },
      }),
    ),
  );
  expect(
    state.action.mock.calls.some(([, operation]) => operation === 'connect'),
  ).toBe(false);
});

test('Chat channel changes require both inspection and connection permission', async () => {
  state.actions = ['nrChat.connect'];
  state.responses.set('nrChat', {
    connected: true,
    lastRun: run,
    slack: {
      connected: true,
      tokenSaved: true,
      name: 'Workspace',
      bot: 'Bot',
      channels: [{ id: 'general', name: 'general', kind: 'text' }],
      lastRun: run,
    },
    discord: { connected: false, tokenSaved: false },
  });
  render(<ChatConnect projectId={7} platform='slack' onChange={onChange} />);
  await screen.findByText(/#general/);
  expect(screen.queryByRole('button', { name: 'Change channels' })).toBeNull();
  expect(state.action.mock.calls.map(([, operation]) => operation)).toEqual([
    'status',
  ]);
});

test.each([CompetitorsConnect, CompetitorWatchTab])(
  'read-only competitor views preserve links and never start suggestions',
  async (Component) => {
    state.responses.set('nrCompetitors', competitors);
    const { container } = render(
      <Component projectId={7} onChange={onChange} />,
    );
    expect(await screen.findByText('Retool')).toBeVisible();
    expect(screen.getByRole('link', { name: 'retool/retool' })).toHaveAttribute(
      'href',
      'https://github.com/retool/retool',
    );
    expect(
      screen.queryByRole('button', {
        name: /Edit|Stop watching|Add website|Add competitor|Detect/,
      }),
    ).toBeNull();
    expect(container.querySelector('input:not([type="checkbox"])')).toBeNull();
    expect(
      state.action.mock.calls.some(([, operation]) => operation === 'suggest'),
    ).toBe(false);
  },
);

test('an empty read-only competitor tab does not trigger automatic AI suggestions', async () => {
  state.responses.set('nrCompetitors', { ...competitors, list: [] });
  render(<CompetitorWatchTab projectId={7} />);
  await screen.findByText('No competitors yet');
  expect(screen.queryByRole('button')).toBeNull();
  expect(state.action.mock.calls.map(([, operation]) => operation)).toEqual([
    'view',
  ]);
});

test('competitor suggestions remain readable without add permission', async () => {
  state.actions = ['nrCompetitors.suggest'];
  state.responses.set('nrCompetitors', { ...competitors, list: [] });
  state.responses.set('nrCompetitors.suggest', {
    at: run.at,
    candidates: [
      {
        name: 'Retool',
        site: 'https://retool.example.test',
        repo: '',
        reason: 'Public product',
        exists: false,
      },
    ],
  });
  render(<CompetitorWatchTab projectId={7} />);
  expect(await screen.findByText('Retool')).toBeVisible();
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  expect(screen.queryByRole('button', { name: /^Add/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Detect again' })).toBeEnabled();
  expect(state.action.mock.calls.map(([, operation]) => operation)).toEqual([
    'view',
    'suggest',
  ]);
});

test('competitor add permission uses the manual form without invoking AI suggestions', async () => {
  state.actions = ['nrCompetitors.add'];
  state.responses.set('nrCompetitors', { ...competitors, list: [] });
  const user = userEvent.setup();
  render(<CompetitorWatchTab projectId={7} />);
  await user.type(
    await screen.findByRole('textbox', { name: 'Competitor name' }),
    'Retool',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Competitor website' }),
    'https://retool.example.test',
  );
  await user.click(screen.getByRole('button', { name: 'Add', exact: true }));
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith(
      'nrCompetitors',
      'add',
      expect.objectContaining({
        body: {
          projectId: 7,
          name: 'Retool',
          site: 'https://retool.example.test',
          repo: '',
        },
      }),
    ),
  );
  expect(
    state.action.mock.calls.some(([, operation]) => operation === 'suggest'),
  ).toBe(false);
});

test.each([
  ['out-of-range hexadecimal', '&#x110000;'],
  ['out-of-range decimal', '&#99999999;'],
  ['unsafe integer', '&#9007199254740993;'],
  ['non-finite value', `&#${'9'.repeat(400)};`],
])(
  'competitor events render %s references without crashing',
  async (_, reference) => {
    const encoded = `${reference} &apos; &#39; &#x27; &#x1F600; &#128512; &amp;#39;`;
    const decoded = `${reference} ' ' ' 😀 😀 &#39;`;
    state.responses.set('nrCompetitors', {
      ...competitors,
      events: [
        {
          id: 'release-entities',
          competitorId: competitor.id,
          competitor: competitor.name,
          type: 'release',
          title: `Release ${encoded}`,
          detail: `Detail ${encoded}`,
          url: 'https://github.com/retool/retool/releases/tag/v1',
          at: run.at,
        },
      ],
    });
    render(<CompetitorWatchTab projectId={7} />);
    expect(
      await screen.findByRole('link', { name: `Release ${decoded}` }),
    ).toHaveAttribute(
      'href',
      'https://github.com/retool/retool/releases/tag/v1',
    );
    expect(screen.getByText(`Detail ${decoded}`)).toBeVisible();
  },
);
