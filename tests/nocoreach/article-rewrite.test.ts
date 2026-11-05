// @vitest-environment node
import { describe, expect, it, test, vi } from 'vitest';
import { MockEngine } from '../../app-plugins/nocoreach-mock/server/engine';
import {
  ModelPreparationError,
  ModelStreamError,
  OnlineProvider,
} from '../../server/nocoreach/execution/provider';
import {
  articleText,
  bodyBlocks,
  changedRuns,
  editPlaces,
} from '../../server/nocoreach/articles/edit-places';
import {
  ARTICLE_REWRITE_SYSTEM,
  ArticleRewrites,
  REWRITE_BODY_MAX,
  RewriteCleaner,
  SELECTION_MARK,
  bodyAround,
  rewritePrompt,
} from '../../server/nocoreach/article-rewrite';
import { articleRewriteInput } from '../../shared/article-edit.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
import { articleFixture, underReview } from './article-edit-fixture';

vi.setConfig({ testTimeout: 60000 });

describe('changed places between two versions', () => {
  it('counts each changed title and summary once and each run of changed body blocks once', () => {
    expect(bodyBlocks('# A\n\n  one\n \n\n two \r\n\r\nthree\n')).toEqual([
      '# A',
      'one',
      'two',
      'three',
    ]);
    expect(changedRuns(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
    expect(changedRuns(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1);
    expect(changedRuns(['a', 'b', 'c', 'd'], ['x', 'b', 'y', 'd'])).toBe(2);
    expect(changedRuns(['a', 'b', 'c'], ['a', 'x', 'y', 'z', 'c'])).toBe(1);
    expect(changedRuns(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(2);
    expect(changedRuns([], ['a'])).toBe(1);
    expect(changedRuns(['a', 'b'], [])).toBe(1);
    // A moved paragraph: removed in one place and added in another.
    expect(changedRuns(['a', 'b', 'c', 'd'], ['a', 'c', 'd', 'b'])).toBe(2);
    const base = {
      slug: 'hello',
      status: 'published',
      locales: { en: { title: 'Hello', description: 'Old', body: 'A\n\nB' } },
    };
    const before = articleText(
      { locales: { en: { body: 'A\n\nB\n\nC' } } },
      base,
    );
    expect(before.locales.en).toEqual({
      title: 'Hello',
      description: 'Old',
      body: 'A\n\nB\n\nC',
    });
    expect(editPlaces(before, before)).toBe(0);
    expect(
      editPlaces(
        before,
        articleText(
          {
            status: 'draft',
            locales: {
              en: { title: 'Hi', body: 'A\n\nB2\n\nC\n\nD' },
              zh: { title: '你好' },
            },
          },
          base,
        ),
      ),
    ).toBe(5);
    // Spaces around a field and blank lines between blocks are not changes.
    expect(
      editPlaces(
        before,
        articleText(
          { locales: { en: { title: ' Hello ', body: 'A\n\n\n\nB\n\nC\n' } } },
          base,
        ),
      ),
    ).toBe(0);
  });
});

const input = (over = {}) =>
  articleRewriteInput.parse({
    projectId: '1',
    taskId: '1',
    artifactId: 'v1',
    locale: 'zh',
    title: '你好',
    description: '旧摘要',
    body: '# 你好\n\n第一段。\n\n第二段很长，需要改短一些。\n\n第三段。',
    selection: '第二段很长，需要改短一些。',
    instruction: '改短一点',
    ...over,
  });

describe('the rewrite prompt', () => {
  it('sends the project rules, the task, the article with the selection marked, the earlier attempts and the instruction', () => {
    const prompt = JSON.parse(
      rewritePrompt({
        project: {
          name: 'Synthetic',
          writingStyle: 'Plain',
          terminology: 'Say "workspace"',
        },
        task: {
          title: 'Improve the hello post',
          brief: 'Rewrite for clarity',
          page: 'https://www.example.com/cn/blog/hello',
          topic: 'hello world',
        },
        articleUrl: 'https://www.example.com/cn/blog/hello',
        input: input({
          history: [{ instruction: '更正式', result: '第二段，正式一些。' }],
        }),
      }),
    );
    expect(prompt).toEqual({
      project: expect.objectContaining({ 项目: 'Synthetic' }),
      task: {
        title: 'Improve the hello post',
        brief: 'Rewrite for clarity',
        page: 'https://www.example.com/cn/blog/hello',
        topic: 'hello world',
      },
      article: {
        language: 'zh',
        page: 'https://www.example.com/cn/blog/hello',
        title: '你好',
        summary: '旧摘要',
        body: `# 你好\n\n第一段。\n\n${SELECTION_MARK}\n\n第三段。`,
      },
      selection: '第二段很长，需要改短一些。',
      attempts: [{ instruction: '更正式', result: '第二段，正式一些。' }],
      instruction: '改短一点',
    });
    expect(JSON.stringify(prompt.project)).toContain('workspace');
    expect(ARTICLE_REWRITE_SYSTEM).toContain(SELECTION_MARK);
    expect(ARTICLE_REWRITE_SYSTEM).toMatch(/only the selection/i);
    expect(ARTICLE_REWRITE_SYSTEM).toMatch(/language of the selection/i);
    expect(ARTICLE_REWRITE_SYSTEM).toMatch(/last text/i);
    // Nothing optional is sent empty.
    const bare = JSON.parse(
      rewritePrompt({
        project: {},
        task: { title: 'T', brief: '' },
        input: input(),
      }),
    );
    expect(bare.task).toEqual({ title: 'T', brief: '' });
    expect(bare).not.toHaveProperty('attempts');
    expect(bare.article).not.toHaveProperty('page');
  });
  it('keeps the text around the selection of a long body, and the beginning when the selection is not found', () => {
    const long = `${'前文。'.repeat(30000)}\n\n选中的一句。\n\n${'后文。'.repeat(30000)}`;
    const around = bodyAround(long, '选中的一句。');
    expect(around.cut).toBe(true);
    expect(around.body.length).toBeLessThanOrEqual(REWRITE_BODY_MAX + 20);
    expect(around.body).toContain(SELECTION_MARK);
    expect(around.body.startsWith('[…]')).toBe(true);
    expect(around.body.endsWith('[…]')).toBe(true);
    const missing = bodyAround(long, '不在正文里');
    expect(missing).toMatchObject({ cut: true });
    expect(missing.body.startsWith('前文。')).toBe(true);
    expect(bodyAround('短正文', '短')).toEqual({
      body: `${SELECTION_MARK}正文`,
      cut: false,
    });
  });
});

const clean = (selection: string, pieces: string[]) => {
  const c = new RewriteCleaner(selection);
  const shown = pieces.map((p) => c.push(p));
  return { shown, text: shown.join('') + c.end() };
};
describe('the answer as shown', () => {
  it('streams a plain answer as it comes, without the spaces around it', () => {
    const r = clean('A sentence.', ['\n  Short', 'er sen', 'tence.  ', '\n']);
    expect(r.text).toBe('Shorter sentence.');
    expect(r.shown.slice(0, 3)).toEqual(['Short', 'er sen', 'tence.']);
  });
  it('drops a code fence or quotation marks wrapped around the whole answer', () => {
    expect(
      clean('A sentence.', ['``', '`markdown\nShorter', ' one.\n`', '``\n'])
        .text,
    ).toBe('Shorter one.');
    expect(clean('A sentence.', ['```\nUses `code`', ' here.']).text).toBe(
      'Uses `code` here.',
    );
    expect(clean('一句话。', ['“短', '一点。”']).text).toBe('短一点。');
    // Quotation marks that do not wrap the whole answer stay.
    expect(clean('A sentence.', ['"Fast," she', ' said.']).text).toBe(
      '"Fast," she said.',
    );
    expect(clean('A sentence.', ['`code` first.']).text).toBe('`code` first.');
  });
  it('keeps a fence or quotation marks the selection itself starts with', () => {
    expect(clean('```js\nx\n```', ['```js\ny\n```']).text).toBe(
      '```js\ny\n```',
    );
    expect(clean('"Quoted" text', ['"Quoted" words']).text).toBe(
      '"Quoted" words',
    );
  });
});

async function mockSetup(scenario = 'normal') {
  const state: Record<string, string> = {};
  const mock = new MockEngine({ enabled: true, environment: 'test' });
  await mock.attach({
    assertPristine: async () => {},
    variables: {
      all: () => state,
      set: async (key, value) => void (state[key] = value),
    },
    app: { resourceManager: { define: vi.fn() }, acl: { allow: vi.fn() } },
    project: async () => ({}),
    requireAccess: async () => 'admin',
  });
  await mock.configure({
    projectId: '1',
    enabled: true,
    scenario,
    seed: 'unit-test',
    clock: '2026-10-12T00:00:00.000Z',
    revision: 0,
  });
  const stream = vi.fn(() => {
    throw new Error('REAL MODEL MUST NOT RUN');
  });
  return {
    mock,
    stream,
    provider: new OnlineProvider({
      mock,
      agents: { models: { gateway: { stream }, services: {} } },
    }),
  };
}
const collect = async (it: AsyncIterable<string>) => {
  const out: string[] = [];
  for await (const piece of it) out.push(piece);
  return out;
};
const prompt = (over = {}) =>
  rewritePrompt({
    project: {},
    task: { title: 'T', brief: '' },
    input: input(over),
  });

describe('streaming a model answer', () => {
  it('hands a simulated rewrite on in small pieces, in the selection language, revising the last attempt', async () => {
    const f = await mockSetup();
    const pieces = await f.mock.run('1', () =>
      collect(f.provider.stream('system', prompt(), 'article-rewrite')),
    );
    expect(pieces.length).toBeGreaterThan(2);
    expect(pieces.join('')).toBe(
      '第二段很长，需要改短一些。（已按“改短一点”改写）',
    );
    const english = await f.mock.run('1', () =>
      collect(
        f.provider.stream(
          'system',
          prompt({
            locale: 'en',
            selection: 'A long sentence. Another one.',
            instruction: 'Make it shorter',
            history: [
              { instruction: 'Formal', result: 'A formal sentence. More.' },
            ],
          }),
          'article-rewrite',
        ),
      ),
    );
    expect(english.join('')).toBe(
      'A formal sentence. (rewritten: Make it shorter)',
    );
    expect(f.stream).not.toHaveBeenCalled();
  });
  it('keeps the simulation scenarios: limits, unusable answers, empty answers and cancellation', async () => {
    const limited = await mockSetup('rate-limit');
    await expect(
      limited.mock.run('1', () =>
        collect(limited.provider.stream('s', prompt(), 'article-rewrite')),
      ),
    ).rejects.toMatchObject({ status: 429 });
    const malformed = await mockSetup('malformed');
    await expect(
      malformed.mock.run('1', () =>
        collect(malformed.provider.stream('s', prompt(), 'article-rewrite')),
      ),
    ).rejects.toBeInstanceOf(ModelStreamError);
    const empty = await mockSetup('empty');
    expect(
      await empty.mock.run('1', () =>
        collect(empty.provider.stream('s', prompt(), 'article-rewrite')),
      ),
    ).toEqual([]);
    const normal = await mockSetup();
    const stop = new AbortController();
    const seen: string[] = [];
    await expect(
      normal.mock.run('1', async () => {
        for await (const piece of normal.provider.stream(
          's',
          prompt(),
          'article-rewrite',
          stop.signal,
        )) {
          seen.push(piece);
          stop.abort();
        }
      }),
    ).rejects.toBeTruthy();
    expect(seen).toHaveLength(1);
  });
  it('streams the default chat model through Agents, and refuses before anything when there is none', async () => {
    const events = [
      { type: 'reasoning', delta: 'thinking' },
      { type: 'text', delta: 'Short' },
      { type: 'text', delta: 'er.' },
      { type: 'finish', reason: 'stop', model: 'm', usage: {} },
    ];
    const stream = vi.fn(async function* () {
      yield* events;
    });
    const services = {
      defaults: vi.fn(async () => ({
        effectiveChat: { modelService: 'svc', model: 'm' },
      })),
      connectionFor: vi.fn(async () => ({})),
    };
    const provider = new OnlineProvider({
      agents: { models: { gateway: { stream }, services } },
    });
    const signal = new AbortController().signal;
    expect(
      await collect(
        provider.stream('the system', 'the prompt', 'article-rewrite', signal),
      ),
    ).toEqual(['Short', 'er.']);
    expect(stream).toHaveBeenCalledWith({
      model: { modelService: 'svc', model: 'm' },
      messages: [
        { role: 'system', content: 'the system' },
        { role: 'user', content: 'the prompt' },
      ],
      signal,
    });
    events[3] = { type: 'finish', reason: 'length', model: 'm', usage: {} };
    await expect(
      collect(provider.stream('s', 'p', 'article-rewrite')),
    ).rejects.toMatchObject({ reason: 'length' });
    services.defaults.mockResolvedValue({ effectiveChat: null });
    await expect(
      collect(provider.stream('s', 'p', 'article-rewrite')),
    ).rejects.toMatchObject({
      reason: 'model_configuration',
      status: 409,
    });
    expect(stream).toHaveBeenCalledTimes(2);
  });
});

/** The rewrite service over the article fixture's task, with the given provider. */
async function rewrites(
  provider,
  run = (_id, fn) => Promise.resolve().then(fn),
) {
  const f = await articleFixture();
  const { v1 } = await underReview(f);
  const service = new ArticleRewrites(() => ({
    db: f.s.p.db,
    project: f.s.p.project,
    taskExecution: { provider, articleFlow: f.s.articleFlow },
    network: { runProject: run },
  }));
  const body = (over = {}) => ({
    projectId: '1',
    taskId: '1',
    artifactId: v1.id,
    locale: 'zh',
    title: '你好',
    description: '旧摘要',
    body: '# 你好\n\n第一段。\n\n第二段。\n\n第三段。',
    selection: '第二段。',
    instruction: '展开一点',
    ...over,
  });
  const start = (over = {}, actor = '1', signal?: AbortSignal) =>
    service.start(actor, body(over), { locale: 'en-US', signal });
  return { f, v1, start };
}
const lines = async (stream: ReadableStream) =>
  (await new Response(stream).text())
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

test('a rewrite streams NDJSON pieces and ends with done; the model reads the task and the article', async () => {
  const m = await mockSetup();
  const spy = vi.spyOn(m.provider, 'stream');
  const r = await rewrites(m.provider, (id, fn) => m.mock.run(id, fn));
  const events = await lines(await r.start());
  expect(events.at(-1)).toEqual({ done: true });
  expect(events.slice(0, -1).every((e) => typeof e.text === 'string')).toBe(
    true,
  );
  expect(
    events
      .slice(0, -1)
      .map((e) => e.text)
      .join(''),
  ).toBe('第二段。（已按“展开一点”改写）');
  const [system, sent, operation, signal] = spy.mock.calls[0];
  expect(system).toBe(ARTICLE_REWRITE_SYSTEM);
  expect(operation).toBe('article-rewrite');
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(sent)).toMatchObject({
    project: { 项目: 'Synthetic' },
    // The title the playbook gave the task at its start.
    task: {
      title: expect.stringContaining('hello world'),
      brief: 'Rewrite the Chinese body for clarity',
      page: 'https://www.example.com/cn/blog/hello',
      topic: 'hello world',
    },
    article: {
      language: 'zh',
      page: 'https://www.example.com/cn/blog/hello',
      body: `# 你好\n\n第一段。\n\n${SELECTION_MARK}\n\n第三段。`,
    },
    selection: '第二段。',
    instruction: '展开一点',
  });
});

test('a rewrite is refused before anything streams: others than the owner, another version, a missing task, no model, one at a time', async () => {
  const m = await mockSetup();
  const r = await rewrites(m.provider, (id, fn) => m.mock.run(id, fn));
  await expect(r.start({}, '2')).rejects.toMatchObject({
    code: 403,
    reason: 'ARTICLE_REWRITE_NOT_OWNER',
    localizedMessage: {
      message: systemMessageText(
        'messages.reviewsTaskLeaveComment',
        { 0: 'Tester' },
        'en-US',
      ),
    },
  });
  await expect(r.start({ artifactId: 'older' })).rejects.toMatchObject({
    code: 409,
    reason: 'ARTICLE_REWRITE_VERSION_CHANGED',
  });
  await expect(r.start({ taskId: '99' })).rejects.toMatchObject({
    code: 404,
    reason: 'ARTICLE_REWRITE_TASK_NOT_FOUND',
  });
  // One at a time per person: the second waits for the first to finish.
  const first = await r.start();
  await expect(r.start()).rejects.toMatchObject({
    code: 429,
    reason: 'ARTICLE_REWRITE_BUSY',
  });
  expect((await lines(first)).at(-1)).toEqual({ done: true });
  expect((await lines(await r.start())).at(-1)).toEqual({ done: true });
  const none = await rewrites({
    // As OnlineProvider.stream refuses: before its first piece.
    stream: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () =>
          Promise.reject(new ModelPreparationError('model_configuration')),
      }),
    }),
  });
  await expect(none.start()).rejects.toMatchObject({
    code: 409,
    reason: 'ARTICLE_REWRITE_NO_MODEL',
    localizedMessage: {
      message: systemMessageText(
        'taskExecution.defaultModelRequired',
        {},
        'en-US',
      ),
    },
  });
  // The person may try again at once after a refusal.
  await expect(none.start()).rejects.toMatchObject({
    reason: 'ARTICLE_REWRITE_NO_MODEL',
  });
  const empty = await rewrites({
    stream: async function* () {
      yield* [];
    },
  });
  await expect(empty.start()).rejects.toMatchObject({
    code: 502,
    reason: 'ARTICLE_REWRITE_FAILED',
  });
});

test('a failure after the first piece ends the stream with an error line; leaving stops the model', async () => {
  const cut = await rewrites({
    stream: async function* () {
      yield 'Half ';
      yield 'a sentence';
      throw new ModelStreamError('length');
    },
  });
  expect(await lines(await cut.start())).toEqual([
    { text: 'Half' },
    { text: ' a sentence' },
    {
      error: systemMessageText('taskExecution.rewriteTooLong', {}, 'en-US'),
      status: 502,
    },
  ]);
  let stopped: AbortSignal | undefined;
  const slow = await rewrites({
    stream: async function* (_s, _p, _o, signal) {
      stopped = signal;
      yield 'One';
      await new Promise((resolve) =>
        signal.addEventListener('abort', resolve, { once: true }),
      );
      signal.throwIfAborted();
    },
  });
  const request = new AbortController();
  const stream = await slow.start({}, '1', request.signal);
  const reader = stream.getReader();
  expect(
    JSON.parse(new TextDecoder().decode((await reader.read()).value)),
  ).toEqual({ text: 'One' });
  request.abort();
  expect(stopped.aborted).toBe(true);
  expect(
    JSON.parse(new TextDecoder().decode((await reader.read()).value)),
  ).toEqual({
    error: systemMessageText('taskExecution.rewriteFailed', {}, 'en-US'),
    status: 502,
  });
  expect(await reader.read()).toEqual({ done: true, value: undefined });
  // The stopped call no longer counts as running.
  const again = new AbortController();
  const next = await slow.start({}, '1', again.signal);
  again.abort();
  await next.cancel();
});
