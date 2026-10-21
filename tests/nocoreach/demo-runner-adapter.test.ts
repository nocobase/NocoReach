// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { TaskAgentsRuntime } from '../../server/nocoreach/execution/agents-runtime';
import type { Run } from '../../server/nocoreach/execution/model';
import type { LegacyTransaction } from '../../server/nocoreach/legacy/database';

// Play the demo Agent's steps back without waiting.
process.env.NOCOREACH_DEMO_AGENT_PACE = '0';
const planned = {
  content: 'Simulated analysis',
  usage: { inputTokens: 10, outputTokens: 5 },
  steps: [
    { pauseMs: 500, type: 'thinking', content: 'Reading the task' },
    {
      pauseMs: 500,
      type: 'toolUse',
      tool: 'Bash',
      input: { command: 'nocoreach task data' },
    },
    { pauseMs: 500, type: 'toolResult', tool: 'Bash', output: 'Task material' },
  ],
};

function fixture(enabled = true) {
  const enqueue = vi.fn();
  const finish = vi.fn();
  const invokeMock = vi.fn(async () => planned);
  const recorded: unknown[] = [];
  const recordDemoEvent = vi.fn(async (run: Run, event: unknown) => {
    recorded.push(event);
    return run;
  });
  const requireMock = vi.fn(async () => {
    if (!enabled) throw new Error('disabled');
  });
  const callbacks: (() => void)[] = [];
  const claim = vi.fn(async (run: Run) =>
    run.status === 'queued'
      ? Object.assign(run, { status: 'running' as const })
      : null,
  );
  const tasks = {
    p: {
      demoProjects: { recognize: async () => true },
      demoConfiguration: { withFreshPolicy: (fn: () => Promise<void>) => fn() },
      demoAgent: {
        id: 'nocoreach.runner',
        title: 'Demo Agent',
        prepare: async () => {
          await requireMock();
          return true;
        },
        execute: invokeMock,
      },
    },
    authorized: vi.fn(async () => true),
    claim,
    finish,
    recordDemoEvent,
  };
  const runtime = new TaskAgentsRuntime(
    { runs: { enqueue } } as unknown as ConstructorParameters<
      typeof TaskAgentsRuntime
    >[0],
    tasks as unknown as ConstructorParameters<typeof TaskAgentsRuntime>[1],
    '/main',
  );
  const tx = {
    afterCommit: (fn: () => void) => callbacks.push(fn),
  } as unknown as LegacyTransaction;
  const run = {
    id: 'test',
    projectId: '1',
    taskId: '2',
    mode: 'plan',
    status: 'queued',
    actor: 'admin',
    ownerId: 'admin',
    input: '{}',
  } as Run;
  return {
    runtime,
    tx,
    run,
    enqueue,
    finish,
    invokeMock,
    callbacks,
    recorded,
    recordDemoEvent,
  };
}
it('uses the Agent proxy without creating a real Runner execution, including recovery', async () => {
  const f = fixture();
  expect(await f.runtime.enqueue(f.run, f.tx)).toBeUndefined();
  expect(f.run.simulated).toBe(true);
  expect(f.invokeMock).not.toHaveBeenCalled();
  // Simulates a restart after commit before its callback: the durable queued business run is recovered by tick.
  await f.runtime.simulate(f.run);
  await f.runtime.simulate(f.run);
  expect(f.finish).toHaveBeenCalledTimes(1);
  expect(f.finish).toHaveBeenCalledWith(
    f.run,
    { content: 'Simulated analysis', usage: planned.usage },
    undefined,
  );
  // The transcript is recorded step by step, in order, without the playback pauses.
  expect(f.recorded).toEqual(
    planned.steps.map(({ pauseMs: _pause, ...event }) => event),
  );
  expect(f.enqueue).not.toHaveBeenCalled();
});
it('stops between two steps when the task is stopped', async () => {
  const f = fixture();
  await f.runtime.enqueue(f.run, f.tx);
  f.recordDemoEvent.mockResolvedValueOnce(f.run).mockResolvedValueOnce(null);
  await f.runtime.simulate(f.run);
  expect(f.recordDemoEvent).toHaveBeenCalledTimes(2);
  expect(f.finish).toHaveBeenCalledWith(f.run, undefined, 'cancelled');
});
it('blocks disabled adapters and publication modes before any real Runner call', async () => {
  const disabled = fixture(false);
  await expect(
    disabled.runtime.enqueue(disabled.run, disabled.tx),
  ).rejects.toThrow('disabled');
  expect(disabled.enqueue).not.toHaveBeenCalled();
  const publication = fixture();
  publication.run.mode = 'merge';
  await expect(
    publication.runtime.enqueue(publication.run, publication.tx),
  ).rejects.toThrow();
  expect(publication.enqueue).not.toHaveBeenCalled();
});

it.each(['build', 'article'] as const)(
  'proxies %s without dispatching a real Runner',
  async (mode) => {
    const f = fixture();
    f.run.mode = mode;
    await f.runtime.enqueue(f.run, f.tx);
    expect(f.run.demoAgentId).toBe('nocoreach.runner');
    await f.runtime.simulate(f.run);
    expect(f.finish).toHaveBeenCalledTimes(1);
    expect(f.enqueue).not.toHaveBeenCalled();
  },
);
it('settles a revoked proxy as a failed simulation without live fallback', async () => {
  const f = fixture();
  await f.runtime.enqueue(f.run, f.tx);
  f.invokeMock.mockRejectedValueOnce(new Error('disabled'));
  await f.runtime.simulate(f.run);
  expect(f.finish).toHaveBeenCalledWith(
    f.run,
    undefined,
    'demo_simulation_unavailable',
  );
  expect(f.enqueue).not.toHaveBeenCalled();
});
