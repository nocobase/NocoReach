// @vitest-environment node
import { expect, test, vi } from 'vitest';
import { createOnlineExecutor } from '../../server/online-agent/executor.js';
import {
  OnlineAgentError,
  type ModelEvent,
  type ModelPort,
  type ExecutionContext,
  type Message,
} from '../../server/online-agent/contracts.js';
import type { OnlineEvent } from '../../shared/online-agent.js';
const model = { modelService: 'test', model: 'test' };
const finish: ModelEvent = {
  type: 'finish',
  reason: 'stop',
  model: 'test',
  usage: { inputTokens: 2, outputTokens: 3 },
};
function fixture(turns: ModelEvent[][], tools: ExecutionContext['tools'] = []) {
  const requests: Message[][] = [],
    events: OnlineEvent[] = [];
  const models: ModelPort = {
    resolve: async () => model,
    async *stream(input) {
      requests.push(structuredClone(input.messages) as Message[]);
      for (const event of turns.shift() || []) yield event;
    },
  };
  const context = {
      instructions: 'Scoped instructions',
      tools,
      authorize: vi.fn(async () => {}),
    },
    abort = new AbortController();
  const run = (steps?: number) =>
    createOnlineExecutor(models, steps).execute({
      model,
      messages: [{ role: 'user', content: 'Task' }],
      context,
      signal: abort.signal,
      emit: async (event) => {
        events.push(event);
      },
    });
  return { run, events, requests, context, abort };
}
test('executes only injected tools, carries results into the next model call, and keeps usage and partial text', async () => {
  const execute = vi.fn(async () => ({ fact: 'Scoped evidence' }));
  const f = fixture(
    [
      [
        { type: 'text', delta: 'Checking' },
        {
          type: 'toolCall',
          call: { id: '1', name: 'read', args: { section: 'context' } },
        },
        { ...finish, reason: 'toolCalls' },
      ],
      [{ type: 'text', delta: 'Answer' }, finish],
    ],
    [{ name: 'read', description: 'Read', inputSchema: {}, execute }],
  );
  expect(await f.run()).toBe('Answer');
  expect(execute).toHaveBeenCalledOnce();
  expect(f.requests[1].at(-1)).toMatchObject({
    role: 'tool',
    content: '{"fact":"Scoped evidence"}',
  });
  expect(f.events.filter((event) => event.type === 'usage')).toHaveLength(2);
  expect(f.context.authorize.mock.calls.length).toBeGreaterThanOrEqual(6);
});
test('rejects unknown tools without executing ambient capabilities and bounds repeated tool calls', async () => {
  const turn: ModelEvent[] = [
    {
      type: 'toolCall',
      call: { id: 'x', name: 'shell', args: { command: 'unexpected' } },
    },
    { ...finish, reason: 'toolCalls' },
  ];
  const f = fixture([turn, turn]);
  await expect(f.run(2)).rejects.toMatchObject({ code: 'stepLimit' });
  expect(f.events.find((event) => event.type === 'toolResult')).toMatchObject({
    ok: false,
    output: 'Tool is not authorized for this run.',
  });
});
test('revoked authorization and cancellation stop before executing a requested tool', async () => {
  const execute = vi.fn();
  const f = fixture(
    [
      [
        { type: 'toolCall', call: { id: '1', name: 'write', args: {} } },
        finish,
      ],
    ],
    [{ name: 'write', description: '', inputSchema: {}, execute }],
  );
  f.context.authorize
    .mockImplementationOnce(async () => {})
    .mockImplementationOnce(async () => {
      throw new OnlineAgentError('accessDenied', 403);
    });
  await expect(f.run()).rejects.toMatchObject({ status: 403 });
  expect(execute).not.toHaveBeenCalled();
  const g = fixture([[{ type: 'text', delta: 'late' }, finish]]);
  g.abort.abort();
  await expect(g.run()).rejects.toBeDefined();
  expect(g.requests).toHaveLength(0);
});
test.each(['length', 'filtered', undefined])(
  'does not report incomplete model output as success (%s)',
  async (reason) => {
    const f = fixture([
      [
        { type: 'text', delta: 'Partial' },
        ...(reason ? [{ ...finish, reason } as ModelEvent] : []),
      ],
    ]);
    await expect(f.run()).rejects.toBeDefined();
    expect(f.events[0]).toMatchObject({ type: 'text', text: 'Partial' });
  },
);
