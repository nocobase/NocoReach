import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { TaskExecutionPanel } from '../../client/pages/task-detail/execution-panel';
const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: 'user' } }),
}));
vi.mock('../../client/pages/doc-view', () => ({
  Markdown: ({ content }: { content: string }) => <p>{content}</p>,
}));
const run = {
  id: 'failed',
  pluginRunId: 'official',
  agentId: 'agent',
  agentName: 'Codex',
  status: 'failed',
  planVersion: 0,
  stepId: 'analyze',
  executorId: 'runner-agent',
  createdAt: '2026-10-10T00:00:00Z',
};
const data = {
  runs: [run],
  execution: {
    runId: run.id,
    run: { executions: [] },
    events: [
      {
        seq: 1,
        at: run.createdAt,
        type: 'text',
        content: JSON.stringify({ ok: false, error: '缺少原帖正文' }),
      },
    ],
    canInspect: true,
    truncated: false,
  },
};
beforeEach(() => {
  action.mockReset().mockResolvedValue(data);
});
afterEach(cleanup);
const mount = (path = '/actions/1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TaskExecutionPanel projectId={2} taskId='1' runs={[run]} />
    </MemoryRouter>,
  );
test('shows business failure as readable text rather than a JSON result wall', async () => {
  mount();
  expect(
    await screen.findByText('缺少原帖正文', { exact: false }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/"ok":false/)).not.toBeInTheDocument();
  expect(screen.getAllByText('执行失败').length).toBeGreaterThan(0);
});
test('does not silently replace an invalid historical run and allows restoring the latest', async () => {
  const user = userEvent.setup();
  mount('/actions/1?run=missing');
  expect(screen.getByText('运行不存在或已不可访问')).toBeInTheDocument();
  expect(action).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '查看最新运行' }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrTaskWork',
      'get',
      expect.objectContaining({
        body: { projectId: '2', taskId: '1', runId: 'failed' },
      }),
    ),
  );
});
test('never renders a transcript when the server denies inspection', async () => {
  action.mockResolvedValue({
    ...data,
    execution: { ...data.execution, canInspect: false, events: [] },
  });
  mount();
  expect(
    await screen.findByText('只有任务运行的参与者和管理员能查看工具记录'),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('缺少原帖正文', { exact: false }),
  ).not.toBeInTheDocument();
});

test('defaults to the newest run even when business history is oldest first', async () => {
  const latest = { ...run, id: 'latest', createdAt: '2026-10-11T00:00:00Z' };
  action.mockResolvedValue({ ...data, runs: [run, latest] });
  render(
    <MemoryRouter>
      <TaskExecutionPanel projectId={2} taskId='1' runs={[run, latest]} />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrTaskWork',
      'get',
      expect.objectContaining({
        body: { projectId: '2', taskId: '1', runId: 'latest' },
      }),
    ),
  );
});

test('translates the persisted asOf validation failure', async () => {
  const { setDictionary } = await import('../../client/i18n');
  const { default: english } = await import('../../shared/i18n/en.json');
  const failed = {
    ...run,
    errorDetail: 'Agent 成果的 report.asOf 超过 1000 字符，请缩短资料时间说明',
  };
  setDictionary(english);
  try {
    action.mockResolvedValue({ ...data, runs: [failed] });
    render(
      <MemoryRouter>
        <TaskExecutionPanel projectId={2} taskId='1' runs={[failed]} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(
        'Agent result report.asOf exceeds 1000 characters. Shorten the data timing description.',
      ),
    ).toBeInTheDocument();
  } finally {
    cleanup();
    setDictionary(null);
  }
});

function protectedData() {
  return {
    ...data,
    runs: [{ ...run, errorDetail: 'Invalid research result' }],
    execution: {
      ...data.execution,
      events: [
        {
          seq: 1,
          at: run.createdAt,
          type: 'text',
          content: 'Protected Runner answer',
        },
      ],
    },
  };
}
test.each([401, 403, 404])(
  'hides loaded Runner evidence and stops polling after %s',
  async (status) => {
    const { NocoReachHttpError } =
      await import('../../client/lib/nocoreach-api');
    const { act } = await import('@testing-library/react');
    let poll: () => void = () => {};
    const originalInterval = globalThis.setInterval;
    const interval = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((callback, delay, ...args) => {
        if (delay !== 5000) return originalInterval(callback, delay, ...args);
        poll = callback as () => void;
        return 0 as never;
      });
    try {
      action
        .mockResolvedValueOnce(protectedData())
        .mockRejectedValue(new NocoReachHttpError('Denied', status, undefined));
      mount();
      await screen.findByText('Protected Runner answer');
      await act(async () => {
        poll();
      });
      expect(screen.queryByText('Protected Runner answer')).toBeNull();
      expect(screen.queryByText('Invalid research result')).toBeNull();
      await act(async () => {
        poll();
      });
      expect(action).toHaveBeenCalledTimes(2);
    } finally {
      interval.mockRestore();
    }
  },
);

test("shows the tool's own message when the run stopped without a business error", async () => {
  action.mockResolvedValue({
    ...data,
    execution: {
      ...data.execution,
      run: {
        executions: [],
        failureReason: 'toolAuth',
        failureDetail: 'Not logged in · Please run /login',
      },
      events: [],
    },
  });
  mount();
  expect(
    await screen.findByText('Not logged in · Please run /login'),
  ).toBeInTheDocument();
});
test('a run a NocoReach restart interrupted names the restart and the official reason', async () => {
  const interrupted = { ...run, restartedAt: '2026-10-22T13:42:00Z' };
  action.mockResolvedValue({
    ...data,
    runs: [interrupted],
    execution: {
      ...data.execution,
      run: { executions: [], failureReason: 'leaseExpired' },
    },
  });
  render(
    <MemoryRouter initialEntries={['/actions/1']}>
      <TaskExecutionPanel projectId={2} taskId='1' runs={[interrupted]} />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText(
      /NocoReach 于 .+ 重新启动（部署或重启），这次运行在服务器停止期间与 Runner 失去联系（leaseExpired）。/,
    ),
  ).toBeInTheDocument();
});

// 2026-10-24 user report on T-35: a fold called Source snapshot for this run only turned into Collapse; for a run
// without forum topics it held a single grey line, opened out of view.
test('a run without forum topics shows no source snapshot', async () => {
  action.mockResolvedValue({
    ...data,
    sources: { capturedAt: run.createdAt, topics: [], warnings: [] },
  });
  mount();
  await screen.findByText('缺少原帖正文', { exact: false });
  expect(screen.queryByText('本次资料快照')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Agent 读到的帖子' })).toBeNull();
  expect(document.body).not.toHaveTextContent('资料准备时间');
});

test('the posts a community reply read are a titled list, with the rest after five topics', async () => {
  const user = userEvent.setup();
  const topics = Array.from({ length: 7 }, (_, i) => ({
    id: `t${i}`,
    title: `Topic ${i + 1}`,
    url: `https://forum.example.com/t/${i + 1}`,
    complete: i !== 1,
    posts: Array.from({ length: i + 2 }, () => ({})),
    missing: [],
  }));
  action.mockResolvedValue({
    ...data,
    sources: { capturedAt: run.createdAt, topics, warnings: [] },
  });
  mount();
  const section = await screen.findByRole('region', {
    name: 'Agent 读到的帖子',
  });
  expect(section).toHaveTextContent('已提供 3 楼 · 资料不完整');
  expect(screen.getByRole('link', { name: 'Topic 5' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Topic 6' })).toBeNull();
  await user.click(screen.getByRole('button', { name: '还有 2 个话题' }));
  expect(screen.getByRole('link', { name: 'Topic 7' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /个话题/ })).toBeNull();
});
