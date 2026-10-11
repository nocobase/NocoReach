import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MeProvider, MemberGate } from '../../client/pages/me';
import {
  XiaohongshuConnect,
  type XiaohongshuView,
} from '../../client/pages/xiaohongshu-connect';
import { xiaohongshuRequest } from '../../client/pages/xiaohongshu-api';
import { setDictionary } from '../../client/i18n';

const auth = vi.hoisted(() => ({
  session: { user: { id: 'admin-a' }, session: { id: 'session-a' } } as {
    user: { id: string };
    session: { id: string };
  } | null,
  isPending: false,
  revision: 1,
  role: 'admin',
}));
const calls = vi.hoisted(
  () =>
    [] as {
      projectId: number;
      action: string;
      session: string | null;
      revision: number;
    }[],
);
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    ...auth,
    client: { signOut: vi.fn() },
    refresh: vi.fn(),
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => auth.revision,
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    action: vi.fn(async () => ({
      id: auth.session?.user.id,
      name: 'Synthetic reviewer',
      role: auth.role,
    })),
    wrapRequests: vi.fn(),
  },
}));
vi.mock('../../client/pages/xiaohongshu-api', () => ({
  xiaohongshuRequest: vi.fn(async (projectId: number, action: string) => {
    calls.push({
      projectId,
      action,
      session: auth.session?.session.id ?? null,
      revision: auth.revision,
    });
    return {
      connected: true,
      revision: 7,
      configured: true,
      collectorId: 'qa',
      collectors: [{ id: 'qa', name: 'Synthetic collector' }],
      query: `Project ${projectId}`,
      verifiedAt: null,
      lastRun: null,
      total: 0,
      running: null,
      notes: [],
      latestIds: [],
    } satisfies XiaohongshuView;
  }),
}));

function App({
  projectId = 1,
  onChange = () => {},
}: {
  projectId?: number;
  onChange?: () => void;
}) {
  return (
    <MeProvider>
      <MemberGate>
        <XiaohongshuConnect
          key={projectId}
          projectId={projectId}
          onChange={onChange}
        />
      </MemberGate>
    </MeProvider>
  );
}
beforeEach(() => {
  auth.session = { user: { id: 'admin-a' }, session: { id: 'session-a' } };
  auth.isPending = false;
  auth.revision = 1;
  auth.role = 'admin';
  calls.length = 0;
  setDictionary(null);
});
afterEach(async () => {
  const dialog = screen.queryByRole('alertdialog');
  if (dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  cleanup();
});
async function openDisconnect() {
  fireEvent.click(await screen.findByRole('button', { name: '断开' }));
  return await screen.findByRole('alertdialog');
}
async function confirmDisconnect() {
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: '断开',
    }),
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  await new Promise((resolve) => setTimeout(resolve, 0));
}
it('control: the real confirmation dispatches one disconnect in its original session', async () => {
  render(<App />);
  await openDisconnect();
  await confirmDisconnect();
  expect(calls.filter((c) => c.action === 'disconnect')).toEqual([
    { projectId: 1, action: 'disconnect', session: 'session-a', revision: 1 },
  ]);
});
it('control: cancelling the real confirmation never dispatches disconnect', async () => {
  render(<App />);
  const dialog = await openDisconnect();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(calls.filter((c) => c.action === 'disconnect')).toEqual([]);
});
it.each([
  'new-session',
  'permission-revision',
  'auth-pending',
  'keyed-project',
] as const)(
  'must reject stale disconnect after %s tears down its owner',
  async (transition) => {
    const app = render(<App />);
    await openDisconnect();
    if (transition === 'new-session')
      auth.session = { user: { id: 'admin-b' }, session: { id: 'session-b' } };
    if (transition === 'permission-revision') auth.revision++;
    if (transition === 'auth-pending') auth.isPending = true;
    app.rerender(<App projectId={transition === 'keyed-project' ? 2 : 1} />);
    if (transition === 'auth-pending')
      expect(document.querySelector('[data-xiaohongshu-connect]')).toBeNull();
    else
      await screen.findByText(
        `搜索：Project ${transition === 'keyed-project' ? 2 : 1}`,
      );
    // Owner teardown must dismiss the separate confirmation root and cancel its pending intent.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const stale = calls.filter((c) => c.action === 'disconnect');
    expect(stale).toEqual([]);
  },
);

it('rejects confirmation when its owner unmounts before the awaiting handler resumes', async () => {
  const app = render(<App />);
  await openDisconnect();
  act(() => {
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: '断开',
      }),
    );
    app.unmount();
  });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(calls.filter((c) => c.action === 'disconnect')).toEqual([]);
});
it('can cancel and then confirm a fresh disconnect in the current owner', async () => {
  const onChange = vi.fn();
  render(<App onChange={onChange} />);
  const dialog = await openDisconnect();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  await openDisconnect();
  await confirmDisconnect();
  expect(calls.filter((c) => c.action === 'disconnect')).toEqual([
    { projectId: 1, action: 'disconnect', session: 'session-a', revision: 1 },
  ]);
  expect(onChange).toHaveBeenCalledOnce();
});
it.each(['success', 'conflict'] as const)(
  'ignores a late disconnect %s after owner teardown',
  async (outcome) => {
    const onChange = vi.fn();
    const app = render(<App onChange={onChange} />);
    await openDisconnect();
    let resolve!: (value: XiaohongshuView) => void;
    let reject!: (reason: unknown) => void;
    vi.mocked(xiaohongshuRequest).mockImplementationOnce(
      () =>
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    await confirmDisconnect();
    app.unmount();
    const callCount = vi.mocked(xiaohongshuRequest).mock.calls.length;
    await act(async () => {
      if (outcome === 'success')
        resolve({ connected: false } as XiaohongshuView);
      else reject(Object.assign(new Error('Conflict'), { status: 409 }));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(vi.mocked(xiaohongshuRequest).mock.calls).toHaveLength(callCount);
    expect(screen.queryByRole('alert')).toBeNull();
  },
);
