import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ApiClientError } from '@nocobase/app-client';
import TaskCreatePage from '../../client/pages/task-create.js';
import { TaskMedia } from '../../client/pages/task-detail/media.js';
import { setDictionary } from '../../client/i18n/index.js';
import english from '../../shared/i18n/en.json';

const { request, navigate, state, confirm, warning, navigationGuard } =
  vi.hoisted(() => ({
    navigationGuard: vi.fn(),
    request: vi.fn(),
    navigate: vi.fn(),
    confirm: vi.fn(),
    warning: vi.fn(),
    state: { project: '1', session: 'session-1' },
  }));
const testApi = { request };
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => testApi,
  useNavigationGuard: navigationGuard,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { session: { id: state.session }, user: { id: 'creator' } },
  }),
}));
vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ search: '?scope=waiting' }),
}));
vi.mock('../../client/pages/reach-data.js', () => ({
  useProject: () => ({
    project: { id: state.project, name: 'Current project' },
  }),
  useUnsavedWarning: warning,
}));
vi.mock('../../client/components/route-dialog.js', () => ({
  RouteDialog: ({
    children,
    footer,
    title,
  }: {
    children: ReactNode;
    footer: ReactNode;
    title: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
      {footer}
    </div>
  ),
}));
vi.mock('../../client/components/reach/confirm.js', () => ({
  confirmAction: confirm,
}));
vi.mock('../../client/components/app-shell/nav-badges.js', () => ({
  refreshNavBadges: vi.fn(),
}));
vi.mock('../../client/lib/toast.js', () => ({ toast: { success: vi.fn() } }));

beforeEach(() => {
  request.mockReset();
  navigate.mockReset();
  confirm.mockResolvedValue(true);
  state.project = '1';
  state.session = 'session-1';
  setDictionary(english);
});
afterEach(cleanup);

it('allows correcting a draft after a definitive validation failure', async () => {
  request
    .mockRejectedValueOnce(Object.assign(new Error('invalid'), { status: 400 }))
    .mockResolvedValueOnce({ data: { id: '42', title: 'Corrected' } });
  render(<TaskCreatePage />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText(/Task title/)).toBeEnabled();
  fireEvent.change(screen.getByLabelText(/Task title/), {
    target: { value: 'Corrected' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(request.mock.calls[1][0].json.title).toBe('Corrected');
  expect(request.mock.calls[1][0].json.requestId).toBe(
    request.mock.calls[0][0].json.requestId,
  );
});

it('removes an already cleaned attachment after a failed discard and clears its error', async () => {
  request
    .mockResolvedValueOnce({ data: record })
    .mockRejectedValueOnce(new Error('Storage unavailable'))
    .mockRejectedValueOnce(
      new ApiClientError('File not found', {
        status: 404,
        domain: 'nocoreach',
        reason: 'TASK_MEDIA_NOT_FOUND',
        method: 'DELETE',
        url: '/api/nocoreachTasks/media/file-1',
      }),
    )
    .mockResolvedValueOnce({ data: { id: '42', title: 'Manual UI task' } });
  render(<TaskCreatePage />);
  fill();
  paste([file()]);
  await screen.findByText('Uploaded');
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  await screen.findByRole('alert');
  expect(screen.getByText('safe.png')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(screen.queryByText('safe.png')).toBeNull());
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(request.mock.calls[3][0].json.attachmentIds).toEqual([]);
});

it.each([
  { status: 401, reason: 'UNAUTHENTICATED' },
  { status: 403, reason: 'TASK_MEDIA_DELETE_DENIED' },
  { status: 404, reason: 'PROJECT_NOT_FOUND' },
  { status: 500, reason: 'INTERNAL_ERROR' },
])(
  'keeps the attachment and feedback for discard $status/$reason',
  async ({ status, reason }) => {
    request.mockResolvedValueOnce({ data: record }).mockRejectedValueOnce(
      new ApiClientError('Discard failed', {
        status,
        reason,
        domain: 'nocoreach',
        method: 'DELETE',
        url: '/api/nocoreachTasks/media/file-1',
      }),
    );
    request.mockResolvedValue({ data: { deleted: true } });
    render(<TaskCreatePage />);
    fill();
    paste([file()]);
    await screen.findByText('Uploaded');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await screen.findByRole('alert');
    expect(screen.getByText('safe.png')).toBeVisible();
  },
);

it('isolates media by task and project, ignores stale results and retries failures', async () => {
  request.mockResolvedValueOnce({ data: [record] });
  const view = render(<TaskMedia projectId={1} taskId='42' />);
  await screen.findByText('safe.png');
  let finish!: (value: unknown) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  view.rerender(<TaskMedia projectId={2} taskId='43' />);
  expect(screen.queryByText('safe.png')).toBeNull();
  request.mockRejectedValueOnce(new Error('failed'));
  view.rerender(<TaskMedia projectId={2} taskId='44' />);
  await screen.findByRole('alert');
  finish({ data: [record] });
  expect(screen.queryByText('safe.png')).toBeNull();
  request.mockResolvedValueOnce({
    data: [{ ...record, filename: 'retried.png' }],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('retried.png');
  expect(screen.queryByRole('alert')).toBeNull();
  request.mockResolvedValueOnce({
    data: [{ ...record, filename: 'next.png' }],
  });
  view.rerender(<TaskMedia projectId={3} taskId='45' />);
  expect(screen.queryByText('retried.png')).toBeNull();
  await screen.findByText('next.png');
});
const file = (type = 'image/png') =>
  new File(['fixture'], type.startsWith('video/') ? 'safe.webm' : 'safe.png', {
    type,
  });
const record = {
  id: 'file-1',
  filename: 'safe.png',
  mimeType: 'image/png',
  size: 7,
  contentUrl: '/main/uploads/task-media/file-1.png',
};
function fill() {
  fireEvent.change(screen.getByLabelText(/Task title/), {
    target: { value: 'Manual UI task' },
  });
  fireEvent.change(screen.getByLabelText(/Description and completion/), {
    target: { value: 'Completion criteria\nsecond line' },
  });
}
function paste(files: File[], text = '') {
  return fireEvent.paste(screen.getByLabelText(/Description and completion/), {
    clipboardData: { files, getData: () => text },
  });
}

it('validates required fields, submits once and reuses an immutable request after failure', async () => {
  request
    .mockRejectedValueOnce(new Error('transport'))
    .mockResolvedValueOnce({ data: { id: '42', title: 'Manual UI task' } });
  render(<TaskCreatePage />);
  fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
  expect(
    await screen.findByText(english['manualTask.titleRequired']),
  ).toBeVisible();
  expect(request).not.toHaveBeenCalled();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    english['manualTask.createFailed'],
  );
  expect(screen.getByLabelText(/Task title/)).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry creation' }));
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith('/actions/42', { replace: true }),
  );
  expect(request.mock.calls[0][0].json).toEqual(request.mock.calls[1][0].json);
  expect(request.mock.calls[0][0].json).toMatchObject({
    projectId: '1',
    description: 'Completion criteria\nsecond line',
    attachmentIds: [],
  });
});

it.each(['image/png', 'video/webm'])(
  'uploads clipboard File %s and blocks creating until uploaded',
  async (type) => {
    let finish!: (value: unknown) => void;
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<TaskCreatePage />);
    fill();
    paste([file(type)]);
    expect(
      screen.getByRole('button', { name: 'Create', exact: true }),
    ).toBeDisabled();
    expect(screen.getByText('Uploading…')).toBeVisible();
    expect(request.mock.calls[0][0].body).toBeInstanceOf(FormData);
    finish({ data: { ...record, mimeType: type } });
    await screen.findByText('Uploaded');
    expect(
      screen.getByRole('button', { name: 'Create', exact: true }),
    ).toBeEnabled();
  },
);

it('preserves text paste and copied URLs, offers file picker/drop and reports upload failure', async () => {
  request.mockRejectedValue(new Error('upload failed'));
  render(<TaskCreatePage />);
  fill();
  expect(paste([], 'https://example.com/video.mp4')).toBe(true);
  expect(request).not.toHaveBeenCalled();
  const textarea = screen.getByLabelText(/Description and completion/);
  fireEvent.drop(textarea.parentElement!.parentElement!, {
    dataTransfer: { types: ['Files'], files: [file()] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    english['manualTask.uploadFailed'],
  );
  expect(
    screen.getByRole('button', { name: 'Create', exact: true }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(
    screen.getByRole('button', { name: 'Create', exact: true }),
  ).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Upload images or videos'), {
    target: { files: [file('video/webm')] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    english['manualTask.uploadFailed'],
  );
});

it('invalidates a draft on project/session change and prevents stale creation navigation', async () => {
  let finish!: (value: unknown) => void;
  request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<TaskCreatePage />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  state.project = '2';
  state.session = 'session-2';
  view.rerender(<TaskCreatePage />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    english['manualTask.scopeChanged'],
  );
  finish({ data: { id: '42', title: 'Manual UI task' } });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Retry creation' }),
    ).toBeDisabled(),
  );
  expect(navigate).not.toHaveBeenCalled();
});

it('renders filenames as text and uses video controls without autoplay after metadata reload', async () => {
  request.mockResolvedValue({
    data: [
      {
        ...record,
        filename: '<img src=x onerror=alert(1)>',
        mimeType: 'video/webm',
        contentUrl: '/main/uploads/task-media/file-1.webm',
      },
    ],
  });
  const { container } = render(<TaskMedia projectId={1} taskId='42' />);
  expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeVisible();
  expect(container.querySelector('img')).toBeNull();
  const video = container.querySelector('video')!;
  expect(video.controls).toBe(true);
  expect(video.autoplay).toBe(false);
  expect(video.src).not.toContain('blob:');
});
