// @vitest-environment node
import { googleJson } from '../../server/nocoreach/google-client.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MockEngine,
  MOCK_SETTINGS_KEY,
  MOCK_DATASET_MARKER,
  mockDelay,
} from '../../app-plugins/nocoreach-mock/server/engine.js';
import type {
  MockAction,
  MockActionContext,
  MockConfig,
  MockHost,
  MockScenario,
} from '../../app-plugins/nocoreach-mock/server/types.js';

const base = {
  enabled: true,
  scenario: 'normal' as MockScenario,
  seed: 'demo',
  clock: '2026-10-12T00:00:00.000Z',
  revision: 0,
};
async function fixture(
  config: MockConfig = { enabled: true, environment: 'test' },
) {
  const values: Record<string, string> = {},
    actions: Record<string, MockAction> = {};
  const variables = {
    all: () => ({ ...values }),
    set: vi.fn(async (key: string, value: string) => {
      values[key] = value;
    }),
  };
  let role: string | null = 'admin';
  const host: MockHost = {
    variables,
    assertPristine: vi.fn(async () => {}),
    app: {
      resourceManager: {
        define: (resource) => {
          Object.assign(actions, resource.actions);
        },
      },
      acl: { allow: vi.fn() },
    },
    project: vi.fn(async (id) => {
      if (!['1', '2'].includes(id))
        throw Object.assign(new Error('missing project'), { status: 404 });
      return { id };
    }),
    requireAccess: vi.fn(async (ctx) => {
      if (!role) ctx.throw(401, 'signed out');
      if (role === 'outsider') ctx.throw(403, 'not a member');
      return role;
    }),
  };
  const engine = new MockEngine(config, 30);
  await engine.attach(host);
  const call = async (action: string, input: unknown) => {
    const ctx: MockActionContext = {
      action: { params: { values: input } },
      set: vi.fn(),
      throw(status, message): never {
        throw Object.assign(new Error(message), { status });
      },
    };
    await actions[action](ctx, async () => {});
    return ctx.body;
  };
  return {
    engine,
    values,
    variables,
    host,
    actions,
    call,
    role: (value: string | null) => {
      role = value;
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('mock engine safety and settings', () => {
  it('requires explicit dedicated environment and is off by default', async () => {
    expect(new MockEngine().enabled).toBe(false);
    for (const environment of ['', 'production', undefined])
      expect(
        () => new MockEngine({ enabled: true, environment } as MockConfig),
      ).toThrow('NR_MOCK_DEDICATED_ENVIRONMENT_REQUIRED');
    const { engine } = await fixture({ enabled: false });
    expect(engine.run('1', () => 'ordinary')).toBe('ordinary');
    expect(engine.status('1').globalEnabled).toBe(false);
    await expect(
      engine.configure({ projectId: '1', ...base }),
    ).rejects.toMatchObject({ code: 'NR_MOCK_GLOBALLY_DISABLED' });
  });
  it('persists isolated settings, rejects conflicting/invalid edits, resets only fixtures', async () => {
    const { engine, variables, values } = await fixture();
    const [one, two] = await Promise.all([
      engine.configure({ projectId: '1', ...base }),
      engine.configure({
        projectId: '2',
        ...base,
        seed: 'second',
        scenario: 'newdata',
      }),
    ]);
    expect(one.revision).toBe(1);
    expect(two.seed).toBe('second');
    expect(variables.set).toHaveBeenCalledWith(
      MOCK_SETTINGS_KEY,
      expect.any(String),
      false,
    );
    await expect(
      engine.configure({ projectId: '1', ...base }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      engine.configure({
        projectId: '1',
        ...base,
        revision: 1,
        clock: 'not-a-date',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      engine.configure({
        projectId: '1',
        ...base,
        revision: 1,
        token: 'secret',
      }),
    ).rejects.toMatchObject({ status: 400 });
    values.business = 'untouched';
    const reset = await engine.reset({ projectId: '2', revision: 1 });
    expect(reset).toMatchObject({
      enabled: true,
      scenario: 'normal',
      seed: 'second',
      clock: base.clock,
      revision: 2,
    });
    expect(values.business).toBe('untouched');
    expect(engine.status('1').revision).toBe(1);
  });
  it('marks the dedicated simulated dataset and refuses to restart it in live mode', async () => {
    const f = await fixture();
    expect(f.values[MOCK_DATASET_MARKER]).toBeTruthy();
    const disabled = new MockEngine({ enabled: false });
    await expect(disabled.attach(f.host)).rejects.toMatchObject({
      code: 'NR_MOCK_DATASET_CANNOT_RUN_LIVE',
      status: 503,
    });
    await f.engine.configure({ projectId: '1', ...base });
    await f.engine.reset({ projectId: '1', revision: 1 });
    expect(f.values[MOCK_DATASET_MARKER]).toBeTruthy();
  });
  it('refuses first-time activation without a verified pristine host and never marks a live database', async () => {
    const f = await fixture({ enabled: false });
    const engine = new MockEngine({ enabled: true, environment: 'test' });
    await expect(
      engine.attach({ ...f.host, assertPristine: undefined }),
    ).rejects.toMatchObject({ code: 'NR_MOCK_PRISTINE_CHECK_REQUIRED' });
    await expect(
      engine.attach({
        ...f.host,
        assertPristine: async () => {
          throw Object.assign(new Error('NR_MOCK_DATABASE_NOT_PRISTINE'), {
            status: 503,
          });
        },
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.values[MOCK_DATASET_MARKER]).toBeUndefined();
    await engine.attach(f.host);
    expect(f.host.assertPristine).toHaveBeenCalledOnce();
    expect(f.values[MOCK_DATASET_MARKER]).toBeTruthy();
  });
  it.each([
    '',
    '{broken',
    '{"version":2,"environment":"test"}',
    '{"version":1,"environment":"production"}',
  ])(
    'refuses an invalid marker %s without relabeling the database',
    async (marker) => {
      const f = await fixture({ enabled: false });
      f.values[MOCK_DATASET_MARKER] = marker;
      for (const enabled of [false, true])
        await expect(
          new MockEngine({ enabled, environment: 'test' }).attach(f.host),
        ).rejects.toMatchObject({
          code: 'NR_MOCK_DATASET_MARKER_INVALID',
          status: 503,
        });
      expect(f.values[MOCK_DATASET_MARKER]).toBe(marker);
    },
  );
  it('rejects an unreadable dataset marker even when it is missing from all()', async () => {
    const f = await fixture({ enabled: false });
    const host = {
      ...f.host,
      variables: {
        ...f.variables,
        cannotRead: (name: string) => name === MOCK_DATASET_MARKER,
      },
    };
    await expect(
      new MockEngine({ enabled: false }).attach(host),
    ).rejects.toMatchObject({ code: 'NR_MOCK_DATASET_MARKER_INVALID' });
    await expect(
      new MockEngine({ enabled: true, environment: 'test' }).attach(host),
    ).rejects.toMatchObject({ code: 'NR_MOCK_DATASET_MARKER_INVALID' });
  });
  it('allows disabled project setup but keeps that run disabled after enabling', async () => {
    const f = await fixture();
    await f.engine.run('1', async () => {
      await expect(f.call('status', { projectId: '1' })).resolves.toMatchObject(
        { enabled: false },
      );
      await f.call('configure', { projectId: '1', ...base });
      await expect(
        f.engine.request('1', 'https://oauth2.googleapis.com/token', {
          method: 'POST',
        }),
      ).rejects.toMatchObject({ code: 'NR_MOCK_PROJECT_DISABLED' });
    });
    expect(f.engine.capture('1').enabled).toBe(true);
  });
  it('checks authentication, membership, administrator mutations and project existence', async () => {
    const f = await fixture();
    f.role(null);
    await expect(f.call('status', { projectId: '1' })).rejects.toMatchObject({
      status: 401,
    });
    f.role('outsider');
    await expect(f.call('status', { projectId: '1' })).rejects.toMatchObject({
      status: 403,
    });
    f.role('member');
    await expect(f.call('status', { projectId: '1' })).resolves.toMatchObject({
      projectId: '1',
    });
    for (const action of ['configure', 'reset'])
      await expect(
        f.call(action, { projectId: '1', ...base }),
      ).rejects.toMatchObject({ status: 403 });
    f.role('admin');
    await expect(
      f.call('configure', { projectId: '1', ...base }),
    ).resolves.toMatchObject({ revision: 1 });
    await expect(f.call('status', { projectId: '3' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(f.call('status', {})).rejects.toMatchObject({ status: 400 });
  });
  it('refuses corrupt settings instead of treating them as off or using live transport', async () => {
    const f = await fixture();
    f.values[MOCK_SETTINGS_KEY] = '{broken';
    expect(() => f.engine.status('1')).toThrow('NR_MOCK_CONFIG_UNREADABLE');
    await expect(
      f.engine.request('1', 'https://example.com'),
    ).rejects.toMatchObject({ status: 503 });
    const other = new MockEngine({ enabled: true, environment: 'test' });
    await expect(other.attach(f.host)).rejects.toMatchObject({ status: 503 });
  });
  it('fails closed for disabled/missing projects, unsupported operations and external effects', async () => {
    const { engine } = await fixture();
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    await expect(
      engine.request('1', 'https://example.com'),
    ).rejects.toMatchObject({ code: 'NR_MOCK_PROJECT_DISABLED' });
    await expect(
      engine.request(undefined, 'https://example.com'),
    ).rejects.toMatchObject({ code: 'NR_MOCK_PROJECT_REQUIRED' });
    await engine.configure({ projectId: '1', ...base });
    await expect(
      engine.request('1', 'https://not-a-fixture.invalid/exfiltrate'),
    ).rejects.toBeInstanceOf(Error);
    expect(() => engine.guardExternal('online-ai')).toThrow(
      'NR_MOCK_UNSUPPORTED_OPERATION',
    );
    expect(network).not.toHaveBeenCalled();
  });
});
describe('immutable run snapshots and real cancellation', () => {
  it('isolates concurrent projects, preserves nested runs and captures configuration once', async () => {
    const { engine } = await fixture();
    await engine.configure({ projectId: '1', ...base });
    await engine.configure({ projectId: '2', ...base, seed: 'two' });
    await engine.run('1', async () => {
      const original = engine.context();
      expect(Object.isFrozen(original)).toBe(true);
      await engine.configure({
        projectId: '1',
        ...base,
        seed: 'changed',
        scenario: 'empty',
        revision: 1,
      });
      expect(engine.context().seed).toBe('demo');
      await engine.run('1', async () => {
        expect(engine.context()).toBe(original);
      });
      await Promise.all([
        engine.run('2', async () => {
          await Promise.resolve();
          expect(engine.context().seed).toBe('two');
        }),
        Promise.resolve().then(() => {
          expect(engine.context()).toBe(original);
        }),
      ]);
      expect(engine.context()).toBe(original);
    });
    expect(engine.capture('1')).toMatchObject({
      seed: 'changed',
      scenario: 'empty',
      revision: 2,
    });
  });
  it('reuses validated persisted job snapshots even after configuration changes', async () => {
    const { engine } = await fixture();
    await engine.configure({ projectId: '1', ...base });
    const snapshot = JSON.parse(JSON.stringify(engine.capture('1')));
    await engine.configure({
      projectId: '1',
      ...base,
      enabled: false,
      revision: 1,
    });
    expect(engine.runSnapshot(snapshot, () => engine.context())).toEqual(
      snapshot,
    );
    expect(() =>
      engine.runSnapshot({ ...snapshot, clock: 'bad' }, () => {}),
    ).toThrow('NR_MOCK_INVALID_SNAPSHOT');
    await engine.configure({ projectId: '2', ...base });
    expect(() =>
      engine.run('2', () => engine.runSnapshot(snapshot, () => {})),
    ).toThrow('NR_MOCK_SNAPSHOT_PROJECT_MISMATCH');
  });
  it('slow requests cancel using the supplied real AbortSignal and do not return late responses', async () => {
    const { engine } = await fixture();
    await engine.configure({
      projectId: '1',
      ...base,
      scenario: 'slow-cancel',
    });
    const abort = new AbortController(),
      reason = new DOMException('cancelled by caller', 'AbortError');
    const pending = engine.request('1', 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: abort.signal,
    });
    abort.abort(reason);
    await expect(pending).rejects.toBe(reason);
    const already = AbortSignal.abort(reason);
    await expect(mockDelay(100, already)).rejects.toBe(reason);
  });
  it('removes delay timers on cancellation and produces a bounded timeout', async () => {
    vi.useFakeTimers();
    const { engine } = await fixture();
    await engine.configure({
      projectId: '1',
      ...base,
      scenario: 'slow-cancel',
    });
    const controller = new AbortController();
    const pending = engine.request('1', 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: controller.signal,
    });
    const rejected = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    expect(await rejected).toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
    await engine.configure({
      projectId: '1',
      ...base,
      scenario: 'timeout',
      revision: 1,
    });
    const timeout = engine.request('1', 'https://oauth2.googleapis.com/token', {
      method: 'POST',
    });
    const timedOut = timeout.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30);
    expect(await timedOut).toMatchObject({ name: 'TimeoutError' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('uses the actual Google expired-grant parser and keeps other resources unauthorized', async () => {
    const { engine } = await fixture();
    await engine.configure({
      projectId: '1',
      ...base,
      scenario: 'login-expired',
    });
    await expect(
      googleJson(
        'https://oauth2.googleapis.com/token',
        { method: 'POST' },
        (url: string | URL, init: RequestInit) =>
          engine.request('1', url, init),
      ),
    ).rejects.toMatchObject({ code: 'invalid_grant', status: 400 });
    const response = await engine.request(
      '1',
      'https://openidconnect.googleapis.com/v1/userinfo',
    );
    expect(response.status).toBe(401);
  });
  it.each([
    ['rate-limit', 429],
    ['login-expired', 400],
    ['error', 503],
    ['malformed', 200],
  ] as const)(
    'returns the %s protocol failure without a real request',
    async (scenario, status) => {
      const { engine } = await fixture();
      await engine.configure({ projectId: '1', ...base, scenario });
      const response = await engine.request(
        '1',
        'https://oauth2.googleapis.com/token',
        { method: 'POST' },
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('x-nocoreach-simulated')).toBe('true');
      if (scenario === 'malformed')
        await expect(response.json()).rejects.toBeInstanceOf(SyntaxError);
    },
  );
});
