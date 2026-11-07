import { act, cleanup, render, screen, within } from '@testing-library/react';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { $t, connectLocale, setDictionary } from '../../client/i18n';
import locales from '../../client/locales';
import { GoogleConnection } from '../../client/pages/google-connection';
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';

const state = vi.hoisted(() => ({ status: {} as Record<string, unknown> }));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true, isPending: false }),
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async (_resource: string, action: string) =>
      action === 'status' ? state.status : { jobs: [] },
    ),
  },
}));
vi.mock('../../client/pages/workspace-cache', () => ({
  useWorkspaceCache: () => ({ invalidate: () => {} }),
}));

let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
});

const connection = {
  accountEmail: 'owner@example.com',
  status: 'ready_for_sync',
  ga4PropertyId: '123',
  gscSiteUrl: 'sc-domain:example.com',
};
// Midday UTC, so the day shown is the same in every time zone the tests run in.
const refusedAt = '2026-11-03T12:00:00.000Z';

async function show(status: Record<string, unknown>) {
  state.status = {
    configured: true,
    redirectUri: null,
    syncEnabled: true,
    connection,
    ...status,
  };
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter>
        <GoogleConnection projectId='123' />
      </MemoryRouter>
    </I18nProvider>,
  );
  return runtime;
}
const tag = () =>
  document.querySelector<HTMLElement>('.nr-panel-title [data-slot="tag"]');

it('shows an authorization Google refused after the seven days of Testing as expired, with how to stop it', async () => {
  const runtime = await show({
    authorized: true,
    authFailedAt: refusedAt,
    testingWeek: true,
  });
  await screen.findByText(chinese['google.authorizationLapsed']);
  expect(tag()).toHaveAttribute('data-tone', 'red');
  expect(tag()).toHaveTextContent(chinese['google.authorizationLapsed']);
  expect(
    screen.getByText(
      /^Google 在 (\d{4}-)?11-03 \d\d:\d\d 拒绝了授权，请重新授权。$/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(chinese['google.testingAppExpiresWeekly']),
  ).toBeInTheDocument();
  // Authorizing again is the one primary action; resources cannot be read until then.
  expect(
    screen.getByRole('button', {
      name: chinese['google.authorizeGoogleAgain'],
    }),
  ).toHaveClass('bg-primary');
  expect(
    screen.queryByRole('button', { name: chinese['google.changeResources'] }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: chinese['google.disconnect'] }),
  ).not.toHaveClass('bg-primary');
  expect(screen.queryByText(chinese['google.authorized'])).toBeNull();
  expect(document.body.textContent).not.toContain(
    chinese['google.resourcesConfirmed'],
  );
  expect(document.body.textContent).not.toMatch(
    /invalid_grant|refresh token|OAuth/i,
  );
  await act(() => runtime.changeLanguage('en-US'));
  expect(tag()).toHaveTextContent(english['google.authorizationLapsed']);
  expect(
    screen.getByText(
      /^Google refused the authorization on Nov 3, .+\. Authorize again\.$/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(english['google.testingAppExpiresWeekly']),
  ).toBeInTheDocument();
});

it('leaves out the Testing hint when the authorization did not last about seven days', async () => {
  await show({ authorized: true, authFailedAt: refusedAt, testingWeek: false });
  await screen.findByText(chinese['google.authorizationLapsed']);
  expect(screen.getByText(/拒绝了授权，请重新授权。$/)).toBeInTheDocument();
  expect(
    screen.queryByText(chinese['google.testingAppExpiresWeekly']),
  ).toBeNull();
});

it('shows a working authorization as authorized, with its confirmed resources', async () => {
  await show({ authorized: true, authFailedAt: null, testingWeek: false });
  await screen.findByText(chinese['google.authorized']);
  expect(tag()).toHaveAttribute('data-tone', 'green');
  expect(document.body.textContent).toContain(
    chinese['google.resourcesConfirmed'],
  );
  expect(
    screen.getByRole('button', { name: chinese['google.changeResources'] }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/拒绝了授权/)).toBeNull();
});

// Midday UTC as well: the time differs by zone, the day does not.
const attemptAt = '2026-11-04T12:02:00.000Z';
const alert = () => screen.getByRole('alert');

it('keeps saying when and why authorizing again last failed, after the address has lost the reason', async () => {
  window.history.replaceState(null, '', '/connections?source=gsc');
  const runtime = await show({
    authorized: true,
    authFailedAt: refusedAt,
    testingWeek: false,
    failedAttempt: { at: attemptAt, reason: 'network_timeout' },
  });
  await screen.findByText(chinese['google.authorizationLapsed']);
  expect(alert()).toHaveTextContent(
    /^(\d{4}-)?11-04 \d\d:\d\d 的授权未成功。后台连接 Google 超时，请检查服务端网络或代理后重新授权。 历史数据不受影响。/,
  );
  // A connection that failed is something Settings › Network can change.
  expect(
    within(alert()).getByRole('link', { name: $t('network.openSettings') }),
  ).toBeInTheDocument();
  expect(screen.getByText(chinese['google.checkBothPermissions'])).toHaveClass(
    'nr-footnote',
  );
  await act(() => runtime.changeLanguage('en-US'));
  expect(alert()).toHaveTextContent(
    /^The authorization on Nov 4, .+ didn't succeed\. The server timed out connecting to Google\. .+ History isn't affected\./,
  );
  expect(
    screen.getByText(english['google.checkBothPermissions']),
  ).toBeInTheDocument();
});

it('says a missing permission plainly, without the network link, before the first authorization too', async () => {
  window.history.replaceState(
    null,
    '',
    '/connections?source=gsc&google=error&reason=missing_permissions',
  );
  await show({
    authorized: false,
    connection: null,
    failedAttempt: { at: attemptAt, reason: 'missing_permissions' },
  });
  await screen.findByText(chinese['google.waitingAuthorization']);
  expect(alert()).toHaveTextContent(
    chinese['google.authorizationLacksReadAccessAnalytics'],
  );
  expect(alert()).toHaveTextContent(/11-04 \d\d:\d\d 的授权未成功。/);
  expect(within(alert()).queryByRole('link')).toBeNull();
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(
    screen.getByText(chinese['google.checkBothPermissions']),
  ).toBeInTheDocument();
});

it('shows a failure the server could not record from the address alone', async () => {
  window.history.replaceState(
    null,
    '',
    '/connections?source=gsc&google=error&reason=state_expired',
  );
  await show({
    authorized: true,
    authFailedAt: null,
    testingWeek: false,
    failedAttempt: { at: attemptAt, reason: 'network_timeout' },
  });
  await screen.findByText(chinese['google.authorized']);
  expect(alert()).toHaveTextContent(
    `${chinese['google.authorizationSessionNoLongerValid']} ${chinese['google.historyNotAffected'].replace('{0} ', '')}`,
  );
  expect(alert()).not.toHaveTextContent('的授权未成功');
});

it('asks nothing of a working authorization with no failed attempt', async () => {
  window.history.replaceState(null, '', '/connections?source=gsc');
  await show({
    authorized: true,
    authFailedAt: null,
    testingWeek: false,
    failedAttempt: null,
  });
  await screen.findByText(chinese['google.authorized']);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(chinese['google.checkBothPermissions'])).toBeNull();
});
