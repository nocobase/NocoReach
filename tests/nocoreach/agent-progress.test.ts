// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import { TaskAgentsRuntime } from '../../server/nocoreach/execution/agents-runtime';

it('concurrent viewers keep ordered unique events and never rewind the transcript cursor', async () => {
  type Page = Awaited<ReturnType<Agents['runs']['events']>>;
  const page = (sequences: number[], lastSeq: number): Page => ({
    events: sequences.map((seq) => ({
      seq,
      at: '2026-10-11T00:00:00Z',
      type: 'status',
      content: String(seq),
    })),
    lastSeq,
  });
  const pending: ((value: Page) => void)[] = [];
  const events = vi.fn(
    () => new Promise<Page>((resolve) => pending.push(resolve)),
  );
  events.mockResolvedValueOnce(page([1], 1));
  const agents = {
    runs: {
      detail: async () => ({ id: 'run', status: 'running', executions: [] }),
      events,
    },
  } as unknown as Agents;
  const runtime = new TaskAgentsRuntime(
    agents,
    {} as ConstructorParameters<typeof TaskAgentsRuntime>[1],
    '/main',
  );
  await runtime.progress('run');
  const slow = runtime.progress('run');
  const fast = runtime.progress('run');
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  pending[1](page([2, 3], 3));
  expect((await fast).events.map((event) => event.seq)).toEqual([1, 2, 3]);
  pending[0](page([2], 2));
  expect((await slow).events.map((event) => event.seq)).toEqual([1, 2, 3]);
  events.mockResolvedValueOnce(page([], 3));
  expect(
    (await runtime.progress('run')).events.map((event) => event.seq),
  ).toEqual([1, 2, 3]);
  expect(events).toHaveBeenLastCalledWith('run', 3, 1000);
});
