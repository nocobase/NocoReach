import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  fixtureResponse,
  FIXTURE_PRODUCT,
  FIXTURE_COVERAGE,
} from './fixtures.js';
import {
  MOCK_SCENARIOS,
  type MockConfig,
  type MockHost,
  type MockProjectSettings,
  type MockRunContext,
  type MockStatus,
  type MockVariables,
  type MockAction,
} from './types.js';

export const MOCK_SETTINGS_KEY = 'NOREACH_MOCK_SETTINGS';
export const MOCK_DATASET_MARKER = 'NOREACH_MOCK_DATASET_MARKER';
const projectSchema = z.string().regex(/^[1-9]\d{0,15}$/);
const settingSchema = z
  .object({
    enabled: z.boolean(),
    scenario: z.enum(MOCK_SCENARIOS),
    seed: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[\p{L}\p{N}_.: -]+$/u),
    clock: z.iso.datetime({ offset: true }),
    revision: z.number().int().nonnegative(),
  })
  .strict();
const storedSchema = z.record(projectSchema, settingSchema);
const configureSchema = settingSchema
  .extend({ projectId: projectSchema })
  .strict();
const snapshotSchema = settingSchema
  .omit({ enabled: true })
  .extend({
    projectId: projectSchema,
    runId: z.string().uuid(),
    enabled: z.boolean().optional(),
  })
  .strict();
const resetSchema = z
  .object({
    projectId: projectSchema,
    revision: z.number().int().nonnegative(),
  })
  .strict();

export class MockError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 409,
  ) {
    super(code);
    this.name = 'MockError';
  }
}
const parseProject = (value: unknown): string => {
  const parsed = projectSchema.safeParse(
    typeof value === 'string' || typeof value === 'number' ? String(value) : '',
  );
  if (!parsed.success) throw new MockError('NR_MOCK_PROJECT_REQUIRED', 400);
  return parsed.data;
};
function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError');
}
/** Respect the caller's real cancellation signal and remove every timer/listener on all exit paths. */
export function mockDelay(
  milliseconds: number,
  signal?: AbortSignal | null,
): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortError(signal!));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Instance-local fixture transport. It contains no fetch/network fallback.
 * The application must route every NocoReach upstream entry through this engine when enabled.
 */
export class MockEngine {
  readonly enabled: boolean;
  readonly environment: 'demo' | 'test' | null;
  private readonly scope = new AsyncLocalStorage<Readonly<MockRunContext>>();
  private readonly initialClock: string;
  private variables?: MockVariables;
  private host?: MockHost;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(
    config: MockConfig = { enabled: false },
    private readonly delayMs = 30_000,
  ) {
    if (
      typeof config.enabled !== 'boolean' ||
      (config.enabled && !['demo', 'test'].includes(config.environment ?? ''))
    )
      throw new MockError('NR_MOCK_DEDICATED_ENVIRONMENT_REQUIRED', 503);
    this.enabled = config.enabled;
    this.environment =
      config.environment === 'demo' || config.environment === 'test'
        ? config.environment
        : null;
    // Capture once; configured projects persist their clock and resets preserve it for repeatable fixtures.
    this.initialClock = new Date(
      new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
    ).toISOString();
  }
  async attach(host: MockHost): Promise<void> {
    if (this.host) {
      if (this.host.variables !== host.variables)
        throw new MockError('NR_MOCK_HOST_ALREADY_ATTACHED', 503);
      return;
    }
    this.variables = host.variables;
    // Validate before exposing actions. Corrupt or unreadable state must never turn simulation into live traffic.
    this.read();
    const variables = host.variables.all();
    const marked = Object.prototype.hasOwnProperty.call(
      variables,
      MOCK_DATASET_MARKER,
    );
    if (host.variables.cannotRead?.(MOCK_DATASET_MARKER))
      throw new MockError('NR_MOCK_DATASET_MARKER_INVALID', 503);
    if (marked) {
      try {
        z.object({
          version: z.literal(1),
          environment: z.enum(['demo', 'test']),
        })
          .strict()
          .parse(JSON.parse(variables[MOCK_DATASET_MARKER]!));
      } catch {
        throw new MockError('NR_MOCK_DATASET_MARKER_INVALID', 503);
      }
    }
    if (!this.enabled && marked)
      throw new MockError('NR_MOCK_DATASET_CANNOT_RUN_LIVE', 503);
    if (this.enabled && !marked) {
      if (!host.assertPristine)
        throw new MockError('NR_MOCK_PRISTINE_CHECK_REQUIRED', 503);
      await host.assertPristine();
      await host.variables.set(
        MOCK_DATASET_MARKER,
        JSON.stringify({ version: 1, environment: this.environment }),
        false,
      );
    }
    this.host = host;
    const wrap =
      (
        admin: boolean,
        fn: (id: string, values: Record<string, unknown>) => unknown,
      ): MockAction =>
      async (ctx, next) => {
        const role = await host.requireAccess(ctx);
        if (admin && role !== 'admin') ctx.throw(403, 'NR_MOCK_ADMIN_REQUIRED');
        ctx.set('Cache-Control', 'no-store');
        const raw = ctx.action.params.values;
        const values =
          raw !== null && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
        const id = parseProject(
          values.projectId ??
            ctx.action.params.projectId ??
            ctx.request?.query?.projectId,
        );
        await host.project(id);
        ctx.body = await fn(id, values);
        await next();
      };
    host.app.resourceManager.define({
      name: 'nrMock',
      actions: {
        status: wrap(false, (id) => this.status(id)),
        configure: wrap(true, (id, values) =>
          this.configure({ ...values, projectId: id }),
        ),
        reset: wrap(true, (id, values) =>
          this.reset({ ...values, projectId: id }),
        ),
      },
    });
    host.app.acl.allow('nrMock', ['status', 'configure', 'reset'], 'loggedIn');
  }
  private read(): Record<string, MockProjectSettings> {
    if (!this.variables) throw new MockError('NR_MOCK_NOT_ATTACHED', 503);
    if (this.variables.cannotRead?.(MOCK_SETTINGS_KEY))
      throw new MockError('NR_MOCK_CONFIG_UNREADABLE', 503);
    const raw = this.variables.all()[MOCK_SETTINGS_KEY];
    if (!raw) return {};
    try {
      return storedSchema.parse(JSON.parse(raw));
    } catch {
      throw new MockError('NR_MOCK_CONFIG_UNREADABLE', 503);
    }
  }
  private defaults(id: string): MockProjectSettings {
    return {
      enabled: false,
      scenario: 'normal',
      seed: `nocoreach-${id}`,
      clock: this.initialClock,
      revision: 0,
    };
  }
  status(projectId: string): MockStatus {
    const id = parseProject(projectId),
      settings = this.read()[id] ?? this.defaults(id);
    return {
      ...settings,
      projectId: id,
      globalEnabled: this.enabled,
      environment: this.environment,
      simulated: this.enabled && settings.enabled,
      coverage: [
        ...Object.keys(FIXTURE_COVERAGE),
        'youtube',
        'bilibili',
        'xiaohongshu',
      ],
      defaults: {
        website: FIXTURE_PRODUCT.origin,
        github: FIXTURE_PRODUCT.repository,
        npm: FIXTURE_PRODUCT.npm,
        pypi: 'nocobloom',
        docker: 'nocobloom/nocobloom',
        discourse: FIXTURE_PRODUCT.community,
      },
    };
  }
  private change(
    projectId: string,
    revision: number,
    fn: (current: MockProjectSettings) => MockProjectSettings,
  ): Promise<MockStatus> {
    if (!this.enabled)
      return Promise.reject(new MockError('NR_MOCK_GLOBALLY_DISABLED'));
    const task = this.writes.then(async () => {
      const all = this.read(),
        current = all[projectId] ?? this.defaults(projectId);
      if (current.revision !== revision)
        throw new MockError('NR_MOCK_REVISION_CONFLICT');
      all[projectId] = { ...fn(current), revision: current.revision + 1 };
      await this.variables!.set(MOCK_SETTINGS_KEY, JSON.stringify(all), false);
      return this.status(projectId);
    });
    this.writes = task.catch(() => undefined);
    return task;
  }
  configure(input: unknown): Promise<MockStatus> {
    const parsed = configureSchema.safeParse(input);
    if (!parsed.success)
      return Promise.reject(new MockError('NR_MOCK_INVALID_SETTINGS', 400));
    const { projectId, ...settings } = parsed.data;
    return this.change(projectId, settings.revision, () => ({
      ...settings,
      clock: new Date(settings.clock).toISOString(),
    }));
  }
  reset(input: unknown): Promise<MockStatus> {
    const parsed = resetSchema.safeParse(input);
    if (!parsed.success)
      return Promise.reject(new MockError('NR_MOCK_INVALID_SETTINGS', 400));
    return this.change(
      parsed.data.projectId,
      parsed.data.revision,
      (current) => ({ ...current, scenario: 'normal' }),
    );
  }
  /** Read-only routing also captures disabled state; only an upstream operation requires availability. */
  private snapshot(projectId?: string): Readonly<MockRunContext> {
    const active = this.scope.getStore();
    const id =
      projectId === undefined ? active?.projectId : parseProject(projectId);
    if (!id) throw new MockError('NR_MOCK_PROJECT_REQUIRED', 400);
    if (!this.enabled) throw new MockError('NR_MOCK_GLOBALLY_DISABLED');
    if (active?.projectId === id) return active;
    const state = this.status(id);
    return Object.freeze({
      projectId: id,
      enabled: state.enabled,
      seed: state.seed,
      clock: state.clock,
      scenario: state.scenario,
      revision: state.revision,
      runId: randomUUID(),
    });
  }
  /** Business dates remain readable when upstream collection is disabled. */
  clock(projectId?: string): string {
    return this.snapshot(projectId).clock;
  }
  /** Only enabled snapshots can enter a fixture provider. */
  context(projectId?: string): Readonly<MockRunContext> {
    const snapshot = this.snapshot(projectId);
    if (snapshot.enabled === false)
      throw new MockError('NR_MOCK_PROJECT_DISABLED');
    return snapshot;
  }
  /** Explicitly persist this credential-free snapshot when a business job crosses timer/process boundaries. */
  capture(projectId: string): Readonly<MockRunContext> {
    return this.context(projectId);
  }
  runSnapshot<T>(snapshot: unknown, fn: () => T): T {
    if (!this.enabled) throw new MockError('NR_MOCK_GLOBALLY_DISABLED');
    const parsed = snapshotSchema.safeParse(snapshot);
    if (!parsed.success) throw new MockError('NR_MOCK_INVALID_SNAPSHOT', 400);
    const active = this.scope.getStore();
    if (active && active.projectId !== parsed.data.projectId)
      throw new MockError('NR_MOCK_SNAPSHOT_PROJECT_MISMATCH', 409);
    return this.scope.run(Object.freeze(parsed.data), fn);
  }
  run<T>(projectId: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const context = this.snapshot(projectId);
    return this.scope.getStore() === context
      ? fn()
      : this.scope.run(context, fn);
  }
  /** Call before every unsupported AI/Runner/remote side effect while simulation is enabled. */
  guardExternal(_operation: string): void {
    if (this.enabled) throw new MockError('NR_MOCK_UNSUPPORTED_OPERATION');
  }
  guard(projectId?: string): void {
    if (this.enabled) this.context(projectId);
  }
  async request(
    projectId: string | undefined,
    url: string | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    const ctx = this.context(projectId);
    if (init.signal?.aborted) throw abortError(init.signal);
    const response = await fixtureResponse(url, init, ctx);
    if (!response) throw new MockError('NR_MOCK_UNMATCHED_REQUEST', 502);
    if (ctx.scenario === 'slow-cancel' || ctx.scenario === 'timeout')
      await mockDelay(this.delayMs, init.signal);
    if (init.signal?.aborted) throw abortError(init.signal);
    if (ctx.scenario === 'timeout')
      throw new DOMException('Simulated upstream timeout', 'TimeoutError');
    const headers = {
      'Content-Type': 'application/json',
      'X-NocoReach-Simulated': 'true',
    };
    if (
      new URL(url).hostname === 'slack.com' &&
      ['rate-limit', 'login-expired', 'error'].includes(ctx.scenario)
    ) {
      const error =
        ctx.scenario === 'rate-limit'
          ? 'ratelimited'
          : ctx.scenario === 'login-expired'
            ? 'invalid_auth'
            : 'mock_error';
      return new Response(JSON.stringify({ ok: false, error }), {
        status: ctx.scenario === 'rate-limit' ? 429 : 200,
        headers: {
          ...headers,
          ...(ctx.scenario === 'rate-limit' ? { 'Retry-After': '1' } : {}),
        },
      });
    }
    if (ctx.scenario === 'rate-limit')
      return new Response(
        JSON.stringify({
          error: { message: 'Simulated rate limit', code: 429 },
        }),
        { status: 429, headers: { ...headers, 'Retry-After': '1' } },
      );
    if (
      ctx.scenario === 'login-expired' &&
      new URL(url).hostname === 'oauth2.googleapis.com' &&
      new URL(url).pathname === '/token'
    )
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Simulated expired grant',
        }),
        { status: 400, headers },
      );
    if (ctx.scenario === 'login-expired')
      return new Response(
        JSON.stringify({
          error: { message: 'Simulated login expired', code: 401 },
        }),
        { status: 401, headers },
      );
    if (ctx.scenario === 'error')
      return new Response(
        JSON.stringify({
          error: { message: 'Simulated upstream error', code: 503 },
        }),
        { status: 503, headers },
      );
    if (ctx.scenario === 'malformed')
      return new Response('{"simulated":', { status: 200, headers });
    response.headers.set('X-NocoReach-Simulated', 'true');
    return response;
  }
}
