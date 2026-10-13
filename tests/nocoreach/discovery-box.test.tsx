import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import {
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import { DiscoveryBox, type Finding } from '../../client/pages/discovery-box';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  setDictionary(null);
  action.mockReset();
});
function Page({
  open,
  onDone,
}: {
  open: (source: string) => void;
  onDone: () => void;
}) {
  useNocoReachLocale();
  return <DiscoveryBox projectId={42} open={open} onDone={onDone} />;
}
const finding = (
  source: string,
  label: string,
  status: Finding['status'],
  connection: Finding['connection'],
): Finding => ({
  source,
  label,
  status,
  connection,
  note: 'Fixture note',
  url: `https://${label}`,
});
test('only new direct sources are selected; connected sources cannot reconnect and replacements require manual selection, in both languages', async () => {
  const items: Finding[] = [
    finding('site', 'acme.dev', 'direct', { status: 'connected' }),
    finding('github', 'acme/new', 'direct', {
      status: 'replaces',
      current: 'acme/current',
    }),
    finding('site', 'docs.acme.dev', 'direct', { status: 'new' }),
    finding('packages', 'Optional package', 'optional', { status: 'new' }),
    ...['ga4', 'gsc', 'github-traffic', 'discord', 'slack'].map((source) =>
      finding(source, source, 'auth', { status: 'connected' }),
    ),
    finding('gsc', 'New Google resource', 'auth', { status: 'new' }),
  ];
  action.mockImplementation(async (resource, operation) => {
    if (resource === 'nrDiscovery')
      return {
        origin: 'https://acme.dev',
        title: 'Acme',
        description: '',
        items,
      };
    if (resource === 'nrSiteContent' && operation === 'discover')
      return { previewId: 'preview', types: { docs: 3 } };
    return {};
  });
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  const open = vi.fn(),
    onDone = vi.fn(),
    user = userEvent.setup();
  render(
    <I18nProvider runtime={runtime}>
      <Page open={open} onDone={onDone} />
    </I18nProvider>,
  );
  await user.type(screen.getByRole('textbox'), 'https://acme.dev');
  await user.click(screen.getByRole('button', { name: 'Discover data' }));
  const connected = await screen.findByRole('checkbox', {
    name: 'Connect acme.dev',
  });
  const replacement = screen.getByRole('radio', {
    name: 'Connect acme/new',
  });
  const fresh = screen.getByRole('checkbox', { name: 'Connect docs.acme.dev' });
  expect(connected).toBeDisabled();
  expect(connected).not.toBeChecked();
  expect(replacement).not.toBeChecked();
  expect(replacement).toBeEnabled();
  expect(fresh).toBeChecked();
  // Each kind is one labelled block with its rule, even when several sources share it (GA4 and Search Console)
  // or its findings are not adjacent (the two websites).
  for (const [kind, rule] of [
    [
      'Website content',
      'Each URL reads its own sitemap, up to 5 URLs per project',
    ],
    [
      'GitHub repository',
      'Pick one; each project connects one main repository',
    ],
    ['Downloads', 'npm, PyPI and Docker Hub packages, up to 10 per project'],
    ['Google', 'Search Console and GA4 share one Google authorization'],
    [
      'GitHub Traffic',
      'Repository views, clones and referring sites; needs a read-only token',
    ],
    ['Team chat', 'Discord and Slack need a bot you create'],
  ]) {
    const blocks = screen.getAllByRole('region', { name: kind });
    expect(blocks).toHaveLength(1);
    expect(within(blocks[0]).getByText(rule)).toBeVisible();
  }
  expect(
    within(
      screen.getByRole('region', { name: 'Website content' }),
    ).getAllByRole('checkbox'),
  ).toHaveLength(2);
  expect(
    screen.getByRole('checkbox', { name: 'Connect Optional package' }),
  ).not.toBeChecked();
  expect(
    screen.getByText(
      'Will replace the current acme/current (historical data will be cleared)',
    ),
  ).toBeVisible();
  expect(screen.getAllByText('Already connected')).toHaveLength(6);
  for (const source of ['ga4', 'gsc', 'github-traffic', 'discord', 'slack'])
    expect(
      within(
        screen.getByText(source).closest('.nr-discovery-row')!,
      ).queryByRole('button'),
    ).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Authorize' }));
  expect(open).toHaveBeenCalledWith('gsc');
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(screen.getAllByText('已接入')).toHaveLength(6);
  expect(
    screen.getByText('会替换现在的 acme/current（历史数据会清空）'),
  ).toBeVisible();
  await act(() => runtime.changeLanguage('en-US'));
  // First pass imports only the newly discovered website, preserving the existing site's page-type selection.
  await user.click(
    screen.getByRole('button', { name: 'Connect the 1 selected sources' }),
  );
  expect(onDone).toHaveBeenCalledOnce();
  expect(
    action.mock.calls.filter(([resource]) => resource !== 'nrDiscovery'),
  ).toEqual([
    [
      'nrSiteContent',
      'discover',
      {
        method: 'POST',
        body: { projectId: 42, url: 'https://docs.acme.dev' },
        unwrap: 'data',
      },
    ],
    [
      'nrSiteContent',
      'confirm',
      {
        method: 'POST',
        body: { projectId: 42, previewId: 'preview', types: ['docs'] },
        unwrap: 'data',
      },
    ],
  ]);
  await user.click(screen.getByRole('button', { name: 'Discover data' }));
  await user.click(
    screen.getByRole('checkbox', { name: 'Connect docs.acme.dev' }),
  );
  await user.click(screen.getByRole('radio', { name: 'Connect acme/new' }));
  expect(screen.getByRole('radio', { name: 'Connect acme/new' })).toBeChecked();
  await user.click(
    screen.getByRole('button', { name: 'Connect the 1 selected sources' }),
  );
  expect(action).toHaveBeenCalledWith('nrGitHub', 'connect', {
    method: 'POST',
    body: { projectId: 42, url: 'https://acme/new' },
    unwrap: 'data',
  });
});

test('GitHub findings are mutually exclusive: picking one clears any other picked GitHub finding', async () => {
  const items: Finding[] = [
    finding('github', 'acme/primary', 'direct', { status: 'new' }),
    finding('github', 'acme/alternate', 'optional', { status: 'new' }),
  ];
  action.mockImplementation(async (resource) => {
    if (resource === 'nrDiscovery')
      return {
        origin: 'https://acme.dev',
        title: 'Acme',
        description: '',
        items,
      };
    return {};
  });
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  const open = vi.fn(),
    onDone = vi.fn(),
    user = userEvent.setup();
  render(
    <I18nProvider runtime={runtime}>
      <Page open={open} onDone={onDone} />
    </I18nProvider>,
  );
  await user.type(screen.getByRole('textbox'), 'https://acme.dev');
  await user.click(screen.getByRole('button', { name: 'Discover data' }));
  const primary = await screen.findByRole('radio', {
    name: 'Connect acme/primary',
  });
  const alternate = screen.getByRole('radio', {
    name: 'Connect acme/alternate',
  });
  expect(primary).toBeChecked();
  expect(alternate).not.toBeChecked();
  // Repositories are one radio group with a single hint above it, not a hint per row.
  expect(
    screen.getAllByText('Pick one; each project connects one main repository'),
  ).toHaveLength(1);
  await user.click(alternate);
  expect(alternate).toBeChecked();
  expect(primary).not.toBeChecked();
  // Clicking the picked repository again leaves no repository selected.
  await user.click(alternate);
  expect(alternate).not.toBeChecked();
  expect(primary).not.toBeChecked();
  await user.click(alternate);
  await user.click(
    screen.getByRole('button', { name: 'Connect the 1 selected sources' }),
  );
  expect(action).toHaveBeenCalledWith('nrGitHub', 'connect', {
    method: 'POST',
    body: { projectId: 42, url: 'https://acme/alternate' },
    unwrap: 'data',
  });
});

// Mirrors source-connections.tsx: the box is keyed by project and seeded with the project's website.
function Prefilled({
  projectId,
  defaultUrl,
}: {
  projectId: number;
  defaultUrl?: string;
}) {
  useNocoReachLocale();
  return (
    <DiscoveryBox
      key={projectId}
      projectId={projectId}
      defaultUrl={defaultUrl}
      open={() => {}}
      onDone={() => {}}
    />
  );
}
test('the project website seeds the address field without starting discovery; typed input survives refreshes and a project switch reseeds it', async () => {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  const user = userEvent.setup();
  const view = (projectId: number, defaultUrl?: string) => (
    <I18nProvider runtime={runtime}>
      <Prefilled projectId={projectId} defaultUrl={defaultUrl} />
    </I18nProvider>
  );
  const { rerender } = render(view(42, 'https://acme.dev'));
  const field = screen.getByRole('textbox');
  expect(field).toHaveValue('https://acme.dev');
  expect(screen.getByRole('button', { name: 'Discover data' })).toBeEnabled();
  await user.clear(field);
  await user.type(field, 'https://docs.acme.dev');
  rerender(view(42, 'https://acme.dev'));
  expect(screen.getByRole('textbox')).toHaveValue('https://docs.acme.dev');
  rerender(view(7, 'https://other.dev'));
  expect(screen.getByRole('textbox')).toHaveValue('https://other.dev');
  rerender(view(8));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Discover data' })).toBeDisabled();
  expect(action).not.toHaveBeenCalled();
});

function Refreshing({ refreshKey }: { refreshKey: number }) {
  useNocoReachLocale();
  return (
    <DiscoveryBox
      projectId={42}
      refreshKey={refreshKey}
      open={() => {}}
      onDone={() => {}}
    />
  );
}
test('after the page reloads saved connections, listed findings show their new status without reading the homepage again', async () => {
  const items: Finding[] = [
    finding('site', 'acme.dev', 'direct', { status: 'new' }),
    finding('site', 'docs.acme.dev', 'direct', { status: 'new' }),
    finding('github', 'acme/primary', 'direct', { status: 'new' }),
    finding('social', 'X @acme', 'auth', { status: 'new' }),
  ];
  action.mockImplementation(async (resource, operation) => {
    if (resource === 'nrDiscovery' && operation === 'discover')
      return {
        origin: 'https://acme.dev',
        title: 'Acme',
        description: '',
        items,
      };
    if (resource === 'nrDiscovery' && operation === 'connections')
      return {
        connections: [
          { status: 'new' },
          { status: 'new' },
          { status: 'replaces', current: 'acme/other' },
          { status: 'connected' },
        ],
      };
    return {};
  });
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  const user = userEvent.setup();
  const view = (refreshKey: number) => (
    <I18nProvider runtime={runtime}>
      <Refreshing refreshKey={refreshKey} />
    </I18nProvider>
  );
  const { rerender } = render(view(1));
  await user.type(screen.getByRole('textbox'), 'https://acme.dev');
  await user.click(screen.getByRole('button', { name: 'Discover data' }));
  const repo = await screen.findByRole('radio', {
    name: 'Connect acme/primary',
  });
  expect(repo).toBeChecked();
  // The user unpicks one website before connecting X in its panel.
  await user.click(
    screen.getByRole('checkbox', { name: 'Connect docs.acme.dev' }),
  );
  expect(screen.getByRole('button', { name: 'Authorize' })).toBeVisible();
  rerender(view(2));
  expect(await screen.findByText('Already connected')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Authorize' })).toBeNull();
  expect(repo).not.toBeChecked();
  expect(
    screen.getByText(
      'Will replace the current acme/other (historical data will be cleared)',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('checkbox', { name: 'Connect acme.dev' }),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Connect docs.acme.dev' }),
  ).not.toBeChecked();
  expect(
    action.mock.calls.filter(([, operation]) => operation === 'discover'),
  ).toHaveLength(1);
  expect(action).toHaveBeenCalledWith('nrDiscovery', 'connections', {
    method: 'POST',
    body: { projectId: 42, items },
    unwrap: 'data',
  });
});
