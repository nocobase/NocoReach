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
  const replacement = screen.getByRole('checkbox', {
    name: 'Connect acme/new',
  });
  const fresh = screen.getByRole('checkbox', { name: 'Connect docs.acme.dev' });
  expect(connected).toBeDisabled();
  expect(connected).not.toBeChecked();
  expect(replacement).not.toBeChecked();
  expect(replacement).toBeEnabled();
  expect(fresh).toBeChecked();
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
  await user.click(screen.getByRole('checkbox', { name: 'Connect acme/new' }));
  expect(
    screen.getByRole('checkbox', { name: 'Connect acme/new' }),
  ).toBeChecked();
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
  const primary = await screen.findByRole('checkbox', {
    name: 'Connect acme/primary',
  });
  const alternate = screen.getByRole('checkbox', {
    name: 'Connect acme/alternate',
  });
  expect(primary).toBeChecked();
  expect(alternate).not.toBeChecked();
  expect(
    screen.getAllByText('Each project connects one main repository'),
  ).toHaveLength(2);
  await user.click(alternate);
  expect(alternate).toBeChecked();
  expect(primary).not.toBeChecked();
  await user.click(
    screen.getByRole('button', { name: 'Connect the 1 selected sources' }),
  );
  expect(action).toHaveBeenCalledWith('nrGitHub', 'connect', {
    method: 'POST',
    body: { projectId: 42, url: 'https://acme/alternate' },
    unwrap: 'data',
  });
});
