// @vitest-environment node
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import {
  executeChat,
  STEP_LIMIT_PROMPT,
  withoutTools,
  type ChatContext,
} from '../../server/online-agent/executor.js';
import {
  OnlineAgentError,
  toolInput,
} from '../../server/online-agent/errors.js';
import type {
  ModelEvent,
  ModelGateway,
  ModelMessage,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { OnlineEvent } from '../../shared/online-agent.js';
const model = { modelService: 'test', model: 'test' };
const finish: ModelEvent = {
  type: 'finish',
  reason: 'stop',
  model: 'test',
  usage: { inputTokens: 2, outputTokens: 3 },
};
function fixture(turns: ModelEvent[][], tools: ChatContext['tools'] = []) {
  const requests: ModelMessage[][] = [],
    declared: (string[] | undefined)[] = [],
    events: OnlineEvent[] = [];
  const models: Pick<ModelGateway, 'stream'> = {
    async *stream(input) {
      requests.push(structuredClone(input.messages) as ModelMessage[]);
      declared.push(input.tools?.map((tool) => tool.name));
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
    executeChat(
      models,
      {
        model,
        messages: [{ role: 'user', content: 'Task' }],
        context,
        signal: abort.signal,
        emit: async (event) => {
          events.push(event);
        },
      },
      steps,
    );
  return { run, events, requests, declared, context, abort };
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
  // The call after the last step declares no tools, so a model that asks for one anyway has not answered.
  const f = fixture([turn, turn, turn]);
  await expect(f.run(2)).rejects.toMatchObject({ code: 'stepLimit' });
  expect(f.events.find((event) => event.type === 'toolResult')).toMatchObject({
    ok: false,
    output: 'Tool is not authorized for this run.',
  });
  expect(f.requests).toHaveLength(3);
  expect(f.events.filter((event) => event.type === 'toolCall')).toHaveLength(2);
  expect(f.events.some((event) => event.type === 'partial')).toBe(false);
});
test('answers from what it read once the steps run out, marked as partial', async () => {
  const execute = vi.fn(async (args: unknown) => ({ page: args }));
  const step = (id: string): ModelEvent[] => [
    { type: 'text', delta: `Reading ${id}. ` },
    { type: 'toolCall', call: { id, name: 'read', args: { offset: id } } },
    { ...finish, reason: 'toolCalls' },
  ];
  const f = fixture(
    [step('1'), step('2'), [{ type: 'text', delta: 'Partial answer' }, finish]],
    [{ name: 'read', description: 'Read', inputSchema: {}, execute }],
  );
  expect(await f.run(2)).toBe('Partial answer');
  expect(execute).toHaveBeenCalledTimes(2);
  expect(f.declared).toEqual([['read'], ['read'], undefined]);
  // The last call reads the tool results as the assistant's own notes, then the request to answer.
  const last = f.requests[2];
  expect(last.some((message) => message.role === 'tool')).toBe(false);
  expect(last.map((message) => message.role)).toEqual([
    'system',
    'user',
    'assistant',
    'user',
  ]);
  expect(last[2].content).toBe(
    [
      'Reading 1. ',
      '[Called read with {"offset":"1"}]',
      '',
      '[Result of read]',
      '{"page":{"offset":"1"}}',
      '',
      'Reading 2. ',
      '[Called read with {"offset":"2"}]',
      '',
      '[Result of read]',
      '{"page":{"offset":"2"}}',
    ].join('\n'),
  );
  expect(last.at(-1)).toEqual({ role: 'user', content: STEP_LIMIT_PROMPT });
  expect(f.events.at(-1)).toEqual({ type: 'partial', reason: 'stepLimit' });
  expect(
    f.events.filter((event) => event.type === 'text').map((e) => e.text),
  ).toEqual(['Reading 1. ', 'Reading 2. ', 'Partial answer']);
});
test('the call without tools keeps earlier turns and their answers as they were', () => {
  expect(
    withoutTools([
      { role: 'system', content: 'S' },
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'a', name: 'task_list', args: {} },
          { id: 'b', name: 'task_get', args: { taskId: '1' } },
        ],
      },
      { role: 'tool', toolCallId: 'a', content: '[]' },
      { role: 'tool', toolCallId: 'b', content: '{}' },
    ]),
  ).toEqual([
    { role: 'system', content: 'S' },
    { role: 'user', content: 'Q1' },
    { role: 'assistant', content: 'A1' },
    { role: 'user', content: 'Q2' },
    {
      role: 'assistant',
      content:
        '[Called task_list with {}]\n[Called task_get with {"taskId":"1"}]\n\n[Result of task_list]\n[]\n\n[Result of task_get]\n{}',
    },
  ]);
});
test('tells the model which fields its arguments broke, and nothing about other failures', async () => {
  const schema = z.strictObject({
    projectId: z.string().regex(/^\d+$/, 'must be the numeric project id'),
    limit: z.number().int().max(50),
  });
  const tools: ChatContext['tools'] = [
    {
      name: 'checked',
      description: '',
      inputSchema: z.toJSONSchema(schema),
      execute: async (args) => toolInput(schema, args),
    },
    {
      name: 'internal',
      description: '',
      inputSchema: {},
      execute: async () => {
        // A schema the tool applies to its own data is not the model's input.
        z.strictObject({ secretColumn: z.string() }).parse({});
      },
    },
    {
      name: 'broken',
      description: '',
      inputSchema: {},
      execute: async () => {
        throw new Error('SQLITE_ERROR: no such table nr_secret at /srv/app');
      },
    },
  ];
  const f = fixture(
    [
      [
        {
          type: 'toolCall',
          call: {
            id: '1',
            name: 'checked',
            args: { projectId: 'nocobase', limit: 'x', extra: true },
          },
        },
        { type: 'toolCall', call: { id: '2', name: 'internal', args: {} } },
        { type: 'toolCall', call: { id: '3', name: 'broken', args: {} } },
        { ...finish, reason: 'toolCalls' },
      ],
      [{ type: 'text', delta: 'Fixed' }, finish],
    ],
    tools,
  );
  expect(await f.run()).toBe('Fixed');
  const results = f.events.filter((event) => event.type === 'toolResult');
  expect(results.map((result) => result.ok)).toEqual([false, false, false]);
  expect(results[0].output).toBe(
    'Invalid input: projectId: must be the numeric project id; limit: Invalid input: expected number, received string; input: Unrecognized key: "extra". Fix these fields and call the tool again.',
  );
  expect(results[1].output).toBe('Tool input or operation was rejected.');
  expect(results[2].output).toBe('Tool input or operation was rejected.');
  expect(f.requests[1].filter((m) => m.role === 'tool')).toHaveLength(3);
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
