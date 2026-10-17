import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CollectorConnection } from '../../client/components/collector-connection';
import {
  nocobaseClient as api,
  NocoReachHttpError,
} from '../../client/lib/nocoreach-api';
import { setDictionary } from '../../client/i18n';
import en from '../../shared/i18n/en.json';

const auth = vi.hoisted(() => ({
  session: { user: { id: 'admin' }, session: { id: 'session-a' } },
  revision: 0,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => auth,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => auth.revision,
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<object>()),
  useNavigationGuard: vi.fn(),
}));
vi.mock('../../client/lib/toast', () => ({ toast: { success: vi.fn() } }));
const empty = { revision: 0, source: 'none', url: '', hasToken: false };
const token = 'test-collector-access-token-123456789';
const url = 'https://collector.example';
const callbacks = { onSaved: vi.fn(), onSavingChange: vi.fn() };
const form = (
  platform: 'xiaohongshu' | 'bilibili' | 'youtube' = 'xiaohongshu',
) => <CollectorConnection projectId={1} platform={platform} {...callbacks} />;
beforeEach(() => {
  setDictionary(null);
  auth.revision = 0;
  vi.clearAllMocks();
  vi.spyOn(api, 'action').mockResolvedValue(empty);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setDictionary(null);
});
it.each(['xiaohongshu', 'bilibili', 'youtube'] as const)(
  'saves %s without browser setup, clears the token, and preserves it on later edits',
  async (platform) => {
    render(form(platform));
    const address = await screen.findByLabelText('采集器地址 *');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(address).toHaveFocus();
    fireEvent.change(address, { target: { value: url } });
    fireEvent.change(screen.getByLabelText('访问令牌 *'), {
      target: { value: token },
    });
    vi.mocked(api.action).mockResolvedValueOnce({
      revision: 1,
      source: 'project',
      url,
      hasToken: true,
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledTimes(1));
    expect(api.action).toHaveBeenLastCalledWith(
      'nrCollectors',
      'save',
      expect.objectContaining({
        body: { projectId: 1, platform, revision: 0, url, token },
        headers: { 'X-NocoReach-Confirmation-Session': 'session-a' },
      }),
    );
    expect(screen.getByLabelText('访问令牌')).toHaveValue('');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.change(address, { target: { value: 'https://other.example' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(
      screen.getByText('地址已改变，请重新输入该采集器的访问令牌。'),
    ).toBeVisible();
    expect(callbacks.onSaved).toHaveBeenCalledTimes(1);
  },
);
it('retains drafts on failure, reloads stale revisions explicitly and follows language changes', async () => {
  render(form());
  fireEvent.change(await screen.findByLabelText('采集器地址 *'), {
    target: { value: url },
  });
  fireEvent.change(screen.getByLabelText('访问令牌 *'), {
    target: { value: token },
  });
  vi.mocked(api.action).mockRejectedValueOnce(
    new NocoReachHttpError('not shown', 409, {
      error: { metadata: { key: 'collectorConnection.stale' } },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await screen.findByRole('button', { name: '重新加载' });
  expect(screen.getByLabelText('访问令牌 *')).toHaveValue(token);
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  act(() => setDictionary(en));
  expect(screen.getByText(en['collectorConnection.stale'])).toBeVisible();
  vi.mocked(api.action).mockResolvedValueOnce({
    revision: 2,
    source: 'project',
    url,
    hasToken: true,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Access token')).toHaveValue(''),
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});
it('drops late saves and secrets when the authorization owner changes', async () => {
  const mounted = render(form());
  fireEvent.change(await screen.findByLabelText('采集器地址 *'), {
    target: { value: url },
  });
  fireEvent.change(screen.getByLabelText('访问令牌 *'), {
    target: { value: token },
  });
  let finish!: (value: unknown) => void;
  vi.mocked(api.action).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  fireEvent.submit(screen.getByLabelText('采集器地址 *').closest('form')!);
  expect(
    vi.mocked(api.action).mock.calls.filter((c) => c[1] === 'save'),
  ).toHaveLength(1);
  auth.revision++;
  mounted.rerender(form());
  await screen.findByLabelText('采集器地址 *');
  await act(async () =>
    finish({ revision: 1, source: 'project', url, hasToken: true }),
  );
  expect(callbacks.onSaved).not.toHaveBeenCalled();
  expect(screen.getByLabelText('访问令牌 *')).toHaveValue('');
});
it('keeps deployment configuration selected until an explicit successful save', async () => {
  vi.mocked(api.action).mockResolvedValue({ ...empty, source: 'deployment' });
  render(form());
  fireEvent.click(await screen.findByRole('button', { name: '填写地址' }));
  expect(screen.getByLabelText('采集器地址 *')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(
    screen.getByText('正在使用部署配置，也可以在这里填写地址。'),
  ).toBeVisible();
  expect(
    vi.mocked(api.action).mock.calls.filter((c) => c[1] === 'save'),
  ).toHaveLength(0);
});
it('places server validation errors beside the field and focuses it', async () => {
  render(form());
  fireEvent.change(await screen.findByLabelText('采集器地址 *'), {
    target: { value: url },
  });
  const secret = screen.getByLabelText('访问令牌 *');
  fireEvent.change(secret, { target: { value: token } });
  vi.mocked(api.action).mockRejectedValueOnce(
    new NocoReachHttpError('not shown', 400, {
      error: { metadata: { key: 'collectorConnection.invalidToken' } },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(secret).toHaveAttribute('aria-invalid', 'true'));
  await waitFor(() => expect(secret).toHaveFocus());
  expect(secret).toHaveValue(token);
  fireEvent.change(secret, { target: { value: `${token}x` } });
  expect(secret).toHaveAttribute('aria-invalid', 'false');
});
it('disables reload while its request is pending', async () => {
  vi.mocked(api.action).mockRejectedValueOnce(new Error('offline'));
  render(form());
  const retry = await screen.findByRole('button', { name: '重试' });
  let finish!: (value: unknown) => void;
  vi.mocked(api.action).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(retry);
  fireEvent.click(retry);
  expect(retry).toBeDisabled();
  expect(api.action).toHaveBeenCalledTimes(2);
  await act(async () => finish(empty));
  expect(await screen.findByLabelText('采集器地址 *')).toBeEnabled();
});
