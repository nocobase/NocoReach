// @vitest-environment node
import { expect, test } from 'vitest';
import {
  CONTINUE_PROMPT,
  continuation,
  keptPart,
  replay,
} from '../../server/online-agent/continuation.js';
import {
  OnlineAgentError,
  onlineErrorCode,
} from '../../server/online-agent/errors.js';
import {
  onlineRunContinuable,
  onlineRunPartial,
  type OnlineEvent,
} from '../../shared/online-agent.js';

const usage = { inputTokens: 1, outputTokens: 1 };
// A reply that read data twice, then stopped in the middle of a table row.
const cut: OnlineEvent[] = [
  { type: 'text', text: 'Reading the data.\n' },
  { type: 'toolCall', id: 'a', name: 'query_data', args: { source: 'gsc' } },
  { type: 'usage', model: 'm', usage },
  {
    type: 'toolResult',
    id: 'a',
    name: 'query_data',
    output: '{"rows":1}',
    ok: true,
  },
  { type: 'toolCall', id: 'b', name: 'query_data', args: { source: 'ga4' } },
  { type: 'toolCall', id: 'c', name: 'read_page', args: { url: '/x' } },
  { type: 'usage', model: 'm', usage },
  {
    type: 'toolResult',
    id: 'b',
    name: 'query_data',
    output: '{"rows":2}',
    ok: true,
  },
  { type: 'toolResult', id: 'c', name: 'read_page', output: 'Page', ok: true },
  { type: 'text', text: '| Keyword | Rank |\n| --- | --- |\n' },
  { type: 'text', text: '| crm | 4 |\n| low co' },
];
const output =
  'Reading the data.\n| Keyword | Rank |\n| --- | --- |\n| crm | 4 |\n| low co';

test('a continued reply keeps everything but its unfinished last line, and a tool call still waiting for its result', () => {
  const kept = keptPart({ events: cut, output });
  expect(kept.output).toBe(
    'Reading the data.\n| Keyword | Rank |\n| --- | --- |\n| crm | 4 |\n',
  );
  expect(kept.events.at(-1)).toEqual({ type: 'text', text: '| crm | 4 |\n' });
  expect(kept.events).toHaveLength(cut.length);
  // The stored record is not changed in place.
  expect(cut.at(-1)).toEqual({ type: 'text', text: '| crm | 4 |\n| low co' });

  const waiting: OnlineEvent[] = [
    ...cut.slice(0, 4),
    { type: 'text', text: 'Now the visits.' },
    { type: 'toolCall', id: 'd', name: 'query_data', args: {} },
  ];
  const second = keptPart({
    events: waiting,
    output: 'Reading the data.\nNow the visits.',
  });
  // Text without a line break is kept whole; the call that never answered is dropped, so the model asks again.
  expect(second.events.map((event) => event.type)).toEqual([
    'text',
    'toolCall',
    'usage',
    'toolResult',
    'text',
  ]);
  expect(second.output).toBe('Reading the data.\nNow the visits.');

  // A last line cut right after its line break loses nothing; a reply that wrote only half a line keeps nothing.
  expect(
    keptPart({
      events: [{ type: 'text', text: 'Done.\n' }],
      output: 'Done.\n',
    }),
  ).toEqual({ events: [{ type: 'text', text: 'Done.\n' }], output: 'Done.\n' });
  expect(
    keptPart({
      events: [{ type: 'text', text: 'Intro\nHalf' }],
      output: 'Intro\nHalf',
    }),
  ).toEqual({ events: [{ type: 'text', text: 'Intro\n' }], output: 'Intro\n' });
});

test('the kept reply is replayed as the steps that produced it, with stored tool results instead of new reads', () => {
  const kept = keptPart({ events: cut, output }).events;
  expect(replay(kept)).toEqual([
    {
      role: 'assistant',
      content: 'Reading the data.\n',
      toolCalls: [{ id: 'a', name: 'query_data', args: { source: 'gsc' } }],
    },
    { role: 'tool', toolCallId: 'a', content: '{"rows":1}' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: 'b', name: 'query_data', args: { source: 'ga4' } },
        { id: 'c', name: 'read_page', args: { url: '/x' } },
      ],
    },
    { role: 'tool', toolCallId: 'b', content: '{"rows":2}' },
    { role: 'tool', toolCallId: 'c', content: 'Page' },
    {
      role: 'assistant',
      content: '| Keyword | Rank |\n| --- | --- |\n| crm | 4 |\n',
    },
  ]);
  // Text it was writing needs the request to go on; after tool results the model simply takes its next step.
  expect(continuation(kept).at(-1)).toEqual({
    role: 'user',
    content: CONTINUE_PROMPT,
  });
  expect(continuation(cut.slice(0, 4)).at(-1)).toEqual({
    role: 'tool',
    toolCallId: 'a',
    content: '{"rows":1}',
  });
  expect(continuation([])).toEqual([]);
});

test('only replies that stopped through no fault of the question can be continued', () => {
  const run = (error: string | null, status = 'failed' as const) => ({
    status,
    error,
  });
  for (const code of [
    'stalled',
    'timeout',
    'interrupted',
    'modelNetwork',
    'serviceUnavailable',
    'modelRateLimit',
    'incompleteResponse',
    'length',
  ])
    expect(onlineRunContinuable(run(code))).toBe(true);
  for (const code of [
    'modelQuota',
    'modelAuth',
    'modelUnavailable',
    'unknown',
    'accessDenied',
    'stepLimit',
    null,
  ])
    expect(onlineRunContinuable(run(code))).toBe(false);
  expect(onlineRunContinuable({ status: 'cancelled', error: 'stalled' })).toBe(
    false,
  );
  expect(onlineRunPartial({ events: [{ type: 'text', text: '  ' }] })).toBe(
    false,
  );
  expect(onlineRunPartial({ events: cut.slice(0, 4) })).toBe(true);
});

test('failures are named by what happened: a restart, an unreachable service, the model, or an unknown cause', () => {
  const model = (code: string, cause?: unknown) =>
    Object.assign(new Error('provider text stays private', { cause }), {
      name: 'ModelError',
      code,
    });
  const system = (code: string) => Object.assign(new Error('socket'), { code });
  expect(onlineErrorCode(model('config'))).toBe('modelUnavailable');
  expect(onlineErrorCode(model('auth'))).toBe('modelAuth');
  expect(onlineErrorCode(model('quota'))).toBe('modelQuota');
  expect(onlineErrorCode(model('rateLimit'))).toBe('modelRateLimit');
  expect(onlineErrorCode(model('network'))).toBe('modelNetwork');
  expect(onlineErrorCode(model('badResponse'))).toBe('modelRejected');
  expect(onlineErrorCode(model('unknown'))).toBe('unknown');
  expect(onlineErrorCode(model('unknown', system('ECONNRESET')))).toBe(
    'modelNetwork',
  );
  // NocoReach's own connections and database failing are not the model's doing.
  expect(onlineErrorCode(system('ECONNREFUSED'))).toBe('serviceUnavailable');
  expect(
    onlineErrorCode(new Error('wrapped', { cause: system('SQLITE_BUSY') })),
  ).toBe('serviceUnavailable');
  expect(
    onlineErrorCode(
      Object.assign(new Error('pool closed'), {
        name: 'SequelizeConnectionError',
      }),
    ),
  ).toBe('serviceUnavailable');
  expect(onlineErrorCode(new TypeError('fetch failed'))).toBe(
    'serviceUnavailable',
  );
  expect(onlineErrorCode(new Error('Something odd'))).toBe('unknown');
  expect(onlineErrorCode('not an error')).toBe('unknown');
  // While NocoReach stops, whatever broke the reply is the restart's doing, except an explicit refusal.
  expect(onlineErrorCode(new Error('Something odd'), true)).toBe('interrupted');
  expect(onlineErrorCode(model('network'), true)).toBe('interrupted');
  expect(onlineErrorCode(new OnlineAgentError('accessDenied', 403), true)).toBe(
    'accessDenied',
  );
});
