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

const { request, navigate, state, confirm, warning, navigationGuard, status } =
  vi.hoisted(() => ({
    navigationGuard: vi.fn(),
    request: vi.fn(),
    navigate: vi.fn(),
    confirm: vi.fn(),
    warning: vi.fn(),
    status: vi.fn(),
    state: { project: '1', session: 'session-1', configure: true },
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
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ can: state.configure, isPending: false }),
}));
vi.mock('../../client/lib/nocoreach-api.js', () => ({
  nocobaseClient: { action: status, wrapRequests: () => undefined },
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
    description,
  }: {
    children: ReactNode;
    footer: ReactNode;
    title: ReactNode;
    description: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
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
  confirm.mockReset();
  confirm.mockResolvedValue(true);
  status.mockReset();
  status.mockResolvedValue({ connected: true });
  state.project = '1';
  state.session = 'session-1';
  state.configure = true;
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

it('keeps a demo-refused task editable without inline failure or success navigation', async () => {
  request
    .mockRejectedValueOnce(
      new ApiClientError('This is a demo. Changes cannot be saved.', {
        status: 400,
        domain: 'demoMode',
        reason: 'DEMO_READ_ONLY',
        method: 'POST',
        url: '/api/nocoreachTasks',
      }),
    )
    .mockResolvedValueOnce({ data: { id: '42', title: 'Edited task' } });
  render(<TaskCreatePage />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Create', exact: true }),
    ).toBeEnabled(),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByLabelText(/Task title/)).toHaveValue('Manual UI task');
  expect(screen.getByLabelText(/Task title/)).toBeEnabled();
  expect(screen.getByLabelText(/Description and completion/)).toHaveValue(
    'Completion criteria\nsecond line',
  );
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Task title/), {
    target: { value: 'Edited task' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(request.mock.calls[1][0].json.title).toBe('Edited task');
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
function manual() {
  fireEvent.click(screen.getByRole('button', { name: 'Fill in manually' }));
}
function fill() {
  if (!screen.queryByLabelText(/Task title/)) manual();
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
  manual();
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
  fireEvent.change(screen.getByLabelText('Upload attachments'), {
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

const draftView = {
  title: 'Rewrite the pricing page title and opening',
  description:
    'Background: /pricing had 120 visits.\n\nWhat to do:\n1. Rewrite the title.\n\nCompletion criteria:\n- The new title is live.',
  why: 'Fewer people reach the plans.',
  playbookId: 'optimize-page',
  playbooks: [
    // Built-in names arrive in their stored system wording and show translated.
    { id: 'optimize-page', name: '优化现有页面', system: true },
    { id: 'custom-1a2b3c4d', name: '我们自己的做法', system: false },
  ],
};
function writeIdea(text: string) {
  fireEvent.change(screen.getByLabelText(/What you want done/), {
    target: { value: text },
  });
}
const organize = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Organize with AI' }));

it('turns a rough idea into an editable draft with AI and creates the edited task', async () => {
  request
    .mockResolvedValueOnce({ data: draftView })
    .mockResolvedValueOnce({ data: { id: '42', title: 'Edited title' } });
  render(<TaskCreatePage />);
  expect(screen.getByText(english['manualTask.ideaHint'])).toBeVisible();
  expect(screen.queryByLabelText(/Task title/)).toBeNull();
  writeIdea('  pricing page gets fewer visits, fix the title  ');
  organize();
  expect(await screen.findByLabelText(/Task title/)).toHaveValue(
    draftView.title,
  );
  expect(request.mock.calls[0][0]).toMatchObject({
    path: 'nocoreachTasks/draft',
    method: 'POST',
    json: {
      projectId: '1',
      idea: 'pricing page gets fewer visits, fix the title',
    },
    headers: { 'X-NocoReach-Task-Session': 'session-1' },
  });
  expect(screen.getByLabelText(/Description and completion/)).toHaveValue(
    draftView.description,
  );
  // The suggested playbook is preselected and stays changeable.
  expect(
    screen.getByRole('combobox', { name: 'Suggested playbook' }),
  ).toHaveTextContent('Improve existing page');
  // The Why card's sentence is prefilled and editable.
  const why = screen.getByRole('textbox', { name: 'Why this task' });
  expect(why).toHaveValue(draftView.why);
  fireEvent.change(why, { target: { value: '  Plans are hard to find.  ' } });
  fireEvent.change(screen.getByLabelText(/Task title/), {
    target: { value: 'Edited title' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith('/actions/42', { replace: true }),
  );
  expect(request.mock.calls[1][0].json).toMatchObject({
    projectId: '1',
    title: 'Edited title',
    why: 'Plans are hard to find.',
    description: draftView.description,
    playbookId: 'optimize-page',
    attachmentIds: [],
  });
});

it('restores the original text after asking when the draft was edited', async () => {
  request.mockResolvedValue({ data: draftView });
  render(<TaskCreatePage />);
  writeIdea('pricing page title');
  organize();
  await screen.findByLabelText(/Task title/);
  // An untouched draft goes back at once.
  fireEvent.click(
    screen.getByRole('button', { name: 'Restore original text' }),
  );
  expect(await screen.findByLabelText(/What you want done/)).toHaveValue(
    'pricing page title',
  );
  expect(confirm).not.toHaveBeenCalled();
  organize();
  await screen.findByLabelText(/Task title/);
  fireEvent.change(screen.getByLabelText(/Task title/), {
    target: { value: 'My edit' },
  });
  confirm.mockResolvedValueOnce(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'Restore original text' }),
  );
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText(/Task title/)).toHaveValue('My edit');
  fireEvent.click(
    screen.getByRole('button', { name: 'Restore original text' }),
  );
  expect(await screen.findByLabelText(/What you want done/)).toHaveValue(
    'pricing page title',
  );
  expect(screen.queryByLabelText(/Task title/)).toBeNull();
});

it('fills in manually with the idea as the description and no playbook', async () => {
  request.mockResolvedValueOnce({ data: { id: '43', title: 'Manual' } });
  render(<TaskCreatePage />);
  writeIdea('Write a launch post');
  manual();
  expect(screen.getByLabelText(/Description and completion/)).toHaveValue(
    'Write a launch post',
  );
  expect(screen.queryByLabelText('Suggested playbook')).toBeNull();
  expect(screen.queryByLabelText('Why this task')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Restore original text' }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText(/Task title/), {
    target: { value: 'Manual' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create', exact: true }));
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0].path).toBe('nocoreachTasks');
  expect(request.mock.calls[0][0].json).not.toHaveProperty('playbookId');
  expect(request.mock.calls[0][0].json).not.toHaveProperty('why');
});

it('asks for an idea before organizing', () => {
  render(<TaskCreatePage />);
  organize();
  expect(screen.getByText(english['manualTask.ideaRequired'])).toBeVisible();
  expect(request).not.toHaveBeenCalled();
});

it('shows where to set up a chat model, and manual creation still works', async () => {
  status.mockResolvedValue({ connected: false });
  render(<TaskCreatePage />);
  writeIdea('Pricing page');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Organize with AI' }),
    ).toBeDisabled(),
  );
  expect(status).toHaveBeenCalledWith(
    'nrOnlineAI',
    'status',
    expect.objectContaining({ body: { projectId: '1' } }),
  );
  // The explanation is an ⓘ beside the button, not a line of text.
  expect(screen.queryByText(english['manualTask.noModel'])).toBeNull();
  expect(screen.getByRole('button', { name: 'Info' })).toBeVisible();
  manual();
  expect(screen.getByLabelText(/Task title/)).toBeEnabled();
});

it('names Model services when the model goes missing, as a link only for those who manage it', async () => {
  state.configure = false;
  request.mockRejectedValueOnce(
    new ApiClientError('No chat model', {
      status: 409,
      domain: 'nocoreach',
      reason: 'TASK_DRAFT_NO_MODEL',
      method: 'POST',
      url: '/api/nocoreachTasks/draft',
    }),
  );
  render(<TaskCreatePage />);
  writeIdea('Pricing page');
  organize();
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(english['manualTask.modelSettingsPath']);
  expect(alert.querySelector('a')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Organize with AI' }),
  ).toBeDisabled();
});

it('keeps the idea when the draft is unusable or the call fails', async () => {
  request
    .mockRejectedValueOnce(
      new ApiClientError('Unusable', {
        status: 422,
        domain: 'nocoreach',
        reason: 'TASK_DRAFT_UNUSABLE',
        method: 'POST',
        url: '/api/nocoreachTasks/draft',
      }),
    )
    .mockRejectedValueOnce(new Error('transport'));
  render(<TaskCreatePage />);
  writeIdea('Pricing page');
  organize();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    english['manualTask.draftUnusable'],
  );
  expect(screen.getByLabelText(/What you want done/)).toHaveValue(
    'Pricing page',
  );
  organize();
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      english['manualTask.draftFailed'],
    ),
  );
  expect(
    screen.getByRole('button', { name: 'Organize with AI' }),
  ).toBeEnabled();
});

it('clears an earlier draft error when Demo Mode refuses the next attempt', async () => {
  request
    .mockRejectedValueOnce(new Error('transport'))
    .mockRejectedValueOnce(
      new ApiClientError('This is a demo. Changes cannot be saved.', {
        status: 400,
        domain: 'demoMode',
        reason: 'DEMO_READ_ONLY',
        method: 'POST',
        url: '/api/nocoreachTasks/draft',
      }),
    )
    .mockResolvedValueOnce({ data: draftView });
  render(<TaskCreatePage />);
  writeIdea('Pricing page');
  organize();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    english['manualTask.draftFailed'],
  );
  organize();
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Organize with AI' }),
    ).toBeEnabled(),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByLabelText(/What you want done/)).toHaveValue(
    'Pricing page',
  );
  expect(navigate).not.toHaveBeenCalled();
  organize();
  expect(await screen.findByLabelText(/Task title/)).toHaveValue(
    draftView.title,
  );
});

const docx = (name = 'brief.docx', type = '') =>
  new File(['PK'], name, { type });

it('names legacy Office files before uploading and the server reason after', async () => {
  request.mockRejectedValueOnce(
    new ApiClientError('Text files must be UTF-8.', {
      status: 400,
      domain: 'nocoreach',
      reason: 'TASK_MEDIA_TEXT_ENCODING',
      method: 'POST',
      url: '/api/nocoreachTasks/media',
    }),
  );
  render(<TaskCreatePage />);
  const picker = screen.getByLabelText('Upload attachments');
  expect(picker).toHaveAttribute(
    'accept',
    expect.stringContaining('.docx,.xlsx,.pdf,.csv,.md,.markdown,.txt'),
  );
  fireEvent.change(picker, {
    target: { files: [docx('old.xls', 'application/vnd.ms-excel')] },
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    english['manualTask.legacyFormat'],
  );
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(picker, {
    target: { files: [new File(['a,b'], 'gbk.csv', { type: 'text/csv' })] },
  });
  await waitFor(() =>
    expect(screen.getAllByRole('alert')[1]).toHaveTextContent(
      english['manualTask.textEncoding'],
    ),
  );
});

it('uploads documents typed by extension and has the draft read them', async () => {
  request
    .mockResolvedValueOnce({
      data: {
        ...record,
        id: 'doc-1',
        filename: 'brief.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    })
    .mockResolvedValueOnce({ data: draftView })
    .mockResolvedValue({ data: { deleted: true } });
  render(<TaskCreatePage />);
  writeIdea('Use the brief');
  // A browser may report no type for a document; its extension decides.
  fireEvent.change(screen.getByLabelText('Upload attachments'), {
    target: { files: [docx()] },
  });
  expect(
    screen.getByRole('button', { name: 'Organize with AI' }),
  ).toBeDisabled();
  await screen.findByText('Uploaded');
  organize();
  await screen.findByLabelText(/Task title/);
  expect(request.mock.calls[1][0]).toMatchObject({
    path: 'nocoreachTasks/draft',
    json: {
      idea: 'Use the brief',
      requestId: request.mock.calls[0][0].query.requestId,
      attachmentIds: ['doc-1'],
    },
  });
});

it('shows documents as chips that download, beside media shown in place', async () => {
  request.mockResolvedValueOnce({
    data: [
      record,
      {
        id: 'doc-1',
        filename: 'brief.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 2048,
        contentUrl: '/main/uploads/task-media/doc-1.docx',
      },
    ],
  });
  const { container } = render(<TaskMedia projectId={1} taskId='42' />);
  expect(await screen.findByText('brief.docx')).toBeVisible();
  expect(
    screen.getByRole('list', { name: english['manualTask.documents'] }),
  ).toBeVisible();
  const download = screen.getByRole('button', {
    name: 'Download brief.docx',
  });
  expect(download).toHaveAttribute(
    'href',
    '/main/uploads/task-media/doc-1.docx',
  );
  expect(download).toHaveAttribute('download', 'brief.docx');
  expect(container.querySelector('img')).toHaveAttribute(
    'src',
    record.contentUrl,
  );
  expect(container.querySelectorAll('img')).toHaveLength(1);
});
