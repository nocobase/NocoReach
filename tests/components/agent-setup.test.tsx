import { StrictMode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { ApiClientError } from '@nocobase/app-client';
import { AgentSetupDialog } from '../../client/components/agent-setup-dialog.js';
import { UserMenu } from '../../client/layouts/components/user-menu.js';
import locales from '../../client/locales/index.js';

const fixture = vi.hoisted(() => ({
  request: vi.fn(),
  notify: vi.fn(),
  refresh: vi.fn(),
  user: { id: 'test-person', name: 'Test person' } as {
    id: string;
    name: string;
  } | null,
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: fixture.request }),
  useToaster: () => ({ show: fixture.notify }),
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: fixture.user },
    refresh: fixture.refresh,
    isPending: false,
  }),
}));
vi.mock('../../client/layouts/components/language-switcher.js', () => ({
  LanguageSwitcher: () => <div role='menuitem'>Language</div>,
}));
const token = (
  name = 'fixture-download-token',
  expiresAt = new Date(Date.now() + 1800000).toISOString(),
) => ({ data: { token: name, expiresAt, maxDownloads: 3 } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let runtime: I18nRuntime;
beforeEach(async () => {
  vi.clearAllMocks();
  fixture.request.mockResolvedValue(token());
  fixture.user = { id: 'test-person', name: 'Test person' };
  runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function tree(open = true) {
  return (
    <StrictMode>
      <I18nProvider runtime={runtime}>
        <AgentSetupDialog open={open} onOpenChange={() => {}} />
      </I18nProvider>
    </StrictMode>
  );
}
const prompt = () => screen.findByLabelText('Agent setup instructions');

test('mints once under StrictMode and renders shell-safe branded instructions with full nested base path', async () => {
  const config = document.getElementById('nocobase-runtime-config')!;
  const original = config.textContent;
  config.textContent = JSON.stringify({
    version: 1,
    config: { app: { basePath: '/teams/demo/reach' } },
  });
  try {
    render(tree());
    expect(await prompt()).toHaveTextContent(
      'http://localhost:3000/teams/demo/reach/api/agents/dist/installScript',
    );
    expect(await prompt()).toHaveTextContent('nocoreach login --server');
    expect(await prompt()).toHaveTextContent('nocoreach whoami');
    expect(await prompt()).toHaveTextContent('nocoreach docs');
    expect(await prompt()).not.toHaveTextContent('nb-studio');
    expect(fixture.request).toHaveBeenCalledTimes(1);
    expect(fixture.request).toHaveBeenCalledWith({
      path: 'agents/dist/downloadTokens',
      method: 'POST',
    });
  } finally {
    config.textContent = original;
  }
});

test('opening is explicit; loading disables copy and duplicate regeneration', async () => {
  const pending = deferred<ReturnType<typeof token>>();
  fixture.request.mockReturnValue(pending.promise);
  const view = render(tree(false));
  expect(fixture.request).not.toHaveBeenCalled();
  view.rerender(tree());
  expect(
    screen.getByRole('status', {
      name: 'Preparing installation instructions…',
    }),
  ).toHaveAccessibleName('Preparing installation instructions…');
  expect(
    screen.getByRole('button', { name: 'Copy instructions' }),
  ).toBeDisabled();
  const regenerate = screen.getByRole('button', { name: 'Generate new token' });
  expect(regenerate).toBeDisabled();
  fireEvent.click(regenerate);
  fireEvent.click(regenerate);
  expect(fixture.request).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(token()));
  expect(await prompt()).toBeVisible();
});

test('copies only after readiness and reports copied state', async () => {
  render(tree());
  await prompt();
  fireEvent.click(screen.getByRole('button', { name: 'Copy instructions' }));
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('fixture-download-token'),
  );
});

test('clipboard failure is generic and leaves selectable instructions', async () => {
  vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
    new Error('private failure token'),
  );
  render(tree());
  await prompt();
  fireEvent.click(screen.getByRole('button', { name: 'Copy instructions' }));
  await waitFor(() =>
    expect(fixture.notify).toHaveBeenCalledWith({
      type: 'error',
      title: 'Could not copy. Select the instructions and copy them manually.',
    }),
  );
  expect(await prompt()).toBeVisible();
  expect(screen.queryByText('private failure token')).toBeNull();
});

test.each([401, 403, 500])(
  'handles HTTP %s without exposing raw errors or inappropriate retry',
  async (status) => {
    fixture.request.mockRejectedValue(
      new ApiClientError('private response', {
        status,
        method: 'POST',
        url: '/fixture',
      }),
    );
    render(tree());
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('private response');
    expect(screen.queryByLabelText('Agent setup instructions')).toBeNull();
    if (status === 401) {
      expect(
        screen.queryByRole('button', { name: 'Generate new token' }),
      ).toBeNull();
      expect(fixture.refresh).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
      await waitFor(() => expect(fixture.refresh).toHaveBeenCalledTimes(1));
    } else if (status === 403) {
      expect(
        screen.queryByRole('button', { name: 'Generate new token' }),
      ).toBeNull();
      expect(alert).toHaveTextContent('permission');
    } else {
      fixture.request.mockResolvedValue(token('retried-token'));
      fireEvent.click(
        screen.getByRole('button', { name: 'Generate new token' }),
      );
      expect(await prompt()).toHaveTextContent('retried-token');
    }
  },
);

test('regeneration removes old token and resets copied state even when request fails', async () => {
  render(tree());
  await prompt();
  fireEvent.click(screen.getByRole('button', { name: 'Copy instructions' }));
  await screen.findByRole('button', { name: 'Copied' });
  fixture.request.mockRejectedValue(new Error('network unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Generate new token' }));
  await screen.findByRole('alert');
  expect(screen.queryByText(/fixture-download-token/)).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Copy instructions' }),
  ).toBeDisabled();
});

test('closing and reopening discards late results from the previous opening', async () => {
  const first = deferred<ReturnType<typeof token>>();
  fixture.request
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(token('new-open-token'));
  const view = render(tree());
  view.rerender(tree(false));
  view.rerender(tree());
  expect(await prompt()).toHaveTextContent('new-open-token');
  await act(async () => first.resolve(token('stale-token')));
  expect(await prompt()).not.toHaveTextContent('stale-token');
  expect(fixture.request).toHaveBeenCalledTimes(2);
});

test('expiry clears instructions and disables copy', async () => {
  fixture.request.mockResolvedValue(
    token('expired-token', new Date(Date.now() - 1).toISOString()),
  );
  render(tree());
  expect(await screen.findByRole('alert')).toHaveTextContent('expired');
  expect(screen.queryByLabelText('Agent setup instructions')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Copy instructions' }),
  ).toBeDisabled();
});

test('supports Chinese copy and prompt without English fallback', async () => {
  await runtime.changeLanguage('zh-CN');
  render(tree());
  expect(await screen.findByLabelText('Agent 配置指引')).toHaveTextContent(
    '等待我在浏览器中核对并批准',
  );
  expect(screen.getByRole('dialog')).toHaveAccessibleName(
    '在 agent 中使用 NocoReach',
  );
  expect(screen.getByRole('button', { name: '复制指引' })).toBeVisible();
});

test('account menu places the terminal entry before language and opens the sibling dialog', async () => {
  render(
    <I18nProvider runtime={runtime}>
      <UserMenu />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
  const items = screen.getAllByRole('menuitem');
  expect(items[0]).toHaveTextContent('Use NocoReach in your agent');
  expect(items[1]).toHaveTextContent('Language');
  fireEvent.click(items[0]);
  expect(await prompt()).toBeVisible();
});

test.each([
  null,
  {},
  { data: null },
  { data: { token: 'bad', expiresAt: 'invalid' } },
])('malformed mint response fails safely: %j', async (response) => {
  fixture.request.mockResolvedValue(response);
  render(tree());
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not prepare',
  );
  expect(
    screen.getByRole('button', { name: 'Copy instructions' }),
  ).toBeDisabled();
});
