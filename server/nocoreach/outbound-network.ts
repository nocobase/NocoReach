import { systemMessageText } from '../../shared/i18n/messages.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  Agent,
  Headers as UndiciHeaders,
  ProxyAgent,
  fetch as request,
  request as rawRequest,
  type RequestInit as UndiciRequestInit,
} from 'undici';
import {
  ProxyProfiles,
  TEST_TARGETS,
  type Connection,
  type ProxyProfile,
} from './proxy-profiles.js';
import { socksTransport } from './socks-proxy.js';
import {
  requireProfileRoute,
  mockProfileSnapshot,
  NetworkProfileError,
  type NetworkProfile,
  type MockProfile,
} from './profile-routing.js';
import type { MockRunContext } from '../../app-plugins/nocoreach-mock/server/types.js';

/** Explicit app-local upstream boundary. A enabled simulator never falls through to a dispatcher. */
export interface SimulatedUpstream {
  readonly enabled: boolean;
  run<T>(projectId: string, fn: () => T): T;
  runSnapshot?<T>(snapshot: unknown, fn: () => T): T;
  currentSnapshot?(): Readonly<MockRunContext> | undefined;
  request(
    projectId: string | undefined,
    url: string | URL,
    init?: RequestInit,
  ): Promise<Response>;
}

const MAX_API_DISPATCHERS = 32;
interface Transport {
  dispatcher: Agent | ProxyAgent;
  cancelPending?: () => void;
  profile?: ProxyProfile;
  users: number;
  retired: boolean;
  closing?: Promise<void>;
}

// Fixed-provider API redirects stay on the original HTTPS origin and keep the same
// dispatcher/deadline. Public downloads use rawRequest and validate each hop themselves.
async function requestApi(url: URL, options: UndiciRequestInit) {
  const redirect = options.redirect ?? 'follow';
  let target = url;
  for (let hops = 0; ; hops++) {
    const response = await request(target, {
      ...options,
      redirect: redirect === 'error' ? 'error' : 'manual',
    });
    const location = response.headers.get('location');
    if (
      redirect !== 'follow' ||
      !location ||
      ![301, 302, 303, 307, 308].includes(response.status)
    )
      return response;
    await response.body?.cancel();
    const next = new URL(location, target);
    if (
      hops >= 5 ||
      next.origin !== url.origin ||
      next.username ||
      next.password
    )
      throw Object.assign(new Error('redirect'), {
        code: 'NR_REDIRECT_REJECTED',
      });
    const method = (options.method ?? 'GET').toUpperCase();
    if (
      (response.status === 303 && method !== 'HEAD') ||
      ([301, 302].includes(response.status) && method === 'POST')
    ) {
      const headers = new UndiciHeaders(options.headers);
      headers.delete('content-type');
      headers.delete('content-length');
      options = {
        ...options,
        method: 'GET',
        body: undefined,
        headers: Object.fromEntries(headers),
      };
    }
    target = next;
  }
}

/** Instance-local scope: never changes Studio's global fetch, environment or dispatcher. */
export class OutboundNetwork {
  private projects = new AsyncLocalStorage<string>();
  private selections = new AsyncLocalStorage<{
    projectId: string;
    profiles: Readonly<Partial<Record<Connection, NetworkProfile>>>;
    contexts: Map<Connection, Readonly<MockRunContext>>;
  }>();
  private apiDispatchers = new Map<string, Transport>();
  private transports = new Set<Transport>();
  private closed = false;
  constructor(
    readonly profiles: ProxyProfiles,
    readonly simulation?: SimulatedUpstream,
  ) {
    profiles.enableMockProfiles?.(simulation?.enabled === true);
  }
  private assertOpen() {
    if (this.closed)
      throw Object.assign(
        new Error(
          systemMessageText('outboundNetwork.collectionNetworkShutDown'),
        ),
        {
          code: 'NR_NETWORK_CLOSED',
        },
      );
  }

  private acquire(
    profile: ProxyProfile | undefined,
    origin: string,
    pinned: { hostname: string } | undefined,
    reuse: boolean,
  ): Transport {
    if (this.closed)
      throw Object.assign(
        new Error(
          systemMessageText('outboundNetwork.collectionNetworkShutDown'),
        ),
        {
          code: 'NR_NETWORK_CLOSED',
        },
      );
    // Cache by origin too, so one Agent cannot silently grow an unbounded set of pools.
    const key = JSON.stringify([profile?.id ?? null, origin]);
    for (const [oldKey, old] of this.apiDispatchers) {
      if (
        old.profile?.id === profile?.id &&
        (old.profile?.revision !== profile?.revision ||
          old.profile?.url !== profile?.url ||
          old.profile?.username !== profile?.username ||
          old.profile?.password !== profile?.password)
      ) {
        this.apiDispatchers.delete(oldKey);
        old.retired = true;
      }
    }
    let transport = reuse ? this.apiDispatchers.get(key) : undefined;
    if (!transport) {
      transport = {
        ...(profile?.url.startsWith('socks5:') ||
        profile?.url.startsWith('socks5h:')
          ? socksTransport(profile, pinned)
          : {
              dispatcher: profile
                ? new ProxyAgent({
                    uri: profile.url,
                    connections: 4,
                    ...(profile.username
                      ? {
                          token: `Basic ${Buffer.from(`${profile.username}:${profile.password}`).toString('base64')}`,
                        }
                      : {}),
                    requestTls: pinned
                      ? { servername: pinned.hostname }
                      : undefined,
                  })
                : new Agent({ connections: 4 }),
            }),
        profile,
        users: 0,
        retired: !reuse,
      };
      this.transports.add(transport);
    }
    transport.users++;
    if (reuse) {
      this.apiDispatchers.delete(key);
      this.apiDispatchers.set(key, transport);
      if (this.apiDispatchers.size > MAX_API_DISPATCHERS) {
        const oldest = this.apiDispatchers.entries().next().value!;
        this.apiDispatchers.delete(oldest[0]);
        oldest[1].retired = true;
      }
    }
    return transport;
  }

  private async destroy(transport: Transport) {
    transport.cancelPending?.();
    transport.closing ??= transport.dispatcher.destroy();
    try {
      await transport.closing;
    } finally {
      this.transports.delete(transport);
    }
  }

  private async release(transport: Transport) {
    transport.users--;
    // Retiring a lease cannot close its dispatcher between the hops of an in-flight redirect.
    await Promise.all(
      [...this.transports]
        .filter((t) => t.retired && t.users === 0)
        .map((t) => this.destroy(t)),
    );
  }

  async close(): Promise<void> {
    this.closed = true;
    this.apiDispatchers.clear();
    await Promise.all([...this.transports].map((t) => this.destroy(t)));
  }
  run<T>(id: string, fn: () => T): T {
    const project = String(id);
    // Live callers retain per-request resolution and error timing. Global admin actions have no project.
    if (!this.simulation?.enabled || !/^[1-9]\d{0,15}$/.test(project))
      return this.projects.run(project, fn);
    const active = this.selections.getStore();
    const run = () =>
      this.projects.run(project, () =>
        this.simulation?.enabled && /^[1-9]\d{0,15}$/.test(project)
          ? this.simulation.run(project, fn)
          : fn(),
      );
    if (active?.projectId === project) return run();
    return this.selections.run(
      {
        projectId: project,
        profiles: this.profiles.snapshot(project),
        contexts: new Map(),
      },
      run,
    );
  }
  // Classic collectors have URL-only helpers. Bind their project entry points once so nested
  // helpers and fire-and-forget work retain the project even when several projects run concurrently.
  bind(service: object, methods: string[], connection?: Connection) {
    for (const name of methods) {
      const original = (service as Record<string, unknown>)[name];
      if (typeof original !== 'function')
        throw new Error(`Unknown collector method: ${name}`);
      const method = original as (id: string, ...args: unknown[]) => unknown;
      Reflect.set(service, name, (id: string, ...args: unknown[]) =>
        this.run(id, () =>
          connection
            ? this.withProfile(connection, () =>
                method.call(service, id, ...args),
              )
            : method.call(service, id, ...args),
        ),
      );
    }
  }
  selected(connection: Connection) {
    const id = this.projects.getStore();
    if (!id)
      throw Object.assign(
        new Error(
          systemMessageText(
            'outboundNetwork.collectionRequestBlockedBecauseProject',
          ),
        ),
        {
          status: 500,
        },
      );
    const profile = this.profile(connection, id);
    requireProfileRoute(profile, this.simulation?.enabled === true);
    if (profile?.kind === 'mock')
      throw new NetworkProfileError('NR_MOCK_PROFILE_TRANSPORT_REQUIRED');
    return profile;
  }
  private profile(
    connection: Connection,
    project?: string,
  ): NetworkProfile | undefined {
    const id = project || this.projects.getStore();
    if (!id) throw new NetworkProfileError('NR_MOCK_PROJECT_REQUIRED');
    const restored = this.simulation?.currentSnapshot?.();
    if (
      restored?.projectId === id &&
      (!restored.connection || restored.connection === connection)
    ) {
      return {
        kind: 'mock',
        // Legacy persisted jobs predate profile identities; their validated run UUID is stable.
        id: restored.profileId ?? restored.runId,
        name: 'Captured mock profile',
        url: '',
        username: '',
        password: '',
        revision: restored.revision,
        updatedAt: restored.clock,
        mock: {
          seed: restored.seed,
          clock: restored.clock,
          scenario: restored.scenario,
        },
      };
    }
    const active = this.selections.getStore();
    return active?.projectId === id
      ? active.profiles[connection]
      : this.profiles.resolve(id, connection);
  }
  /** Resolve before DNS, subprocesses or other external I/O. */
  isSimulated(connection: Connection, project?: string): boolean {
    return (
      requireProfileRoute(
        this.profile(connection, project),
        this.simulation?.enabled === true,
      ) === 'mock'
    );
  }
  mockContext(
    connection: Connection,
    project?: string,
  ): Readonly<MockRunContext> {
    this.assertOpen();
    const id = project || this.projects.getStore();
    if (!id) throw new NetworkProfileError('NR_MOCK_PROJECT_REQUIRED');
    const profile = this.profile(connection, id);
    requireProfileRoute(profile, this.simulation?.enabled === true);
    if (profile?.kind !== 'mock')
      throw new NetworkProfileError('NR_MOCK_PROFILE_REQUIRED');
    const restored = this.simulation?.currentSnapshot?.();
    if (
      restored?.projectId === id &&
      (!restored.connection || restored.connection === connection)
    ) {
      // Legacy queued jobs keep their captured settings; new jobs also keep the selected profile identity.
      return Object.freeze({
        ...restored,
        profileId: restored.profileId ?? profile.id,
        connection,
      });
    }
    const active = this.selections.getStore();
    const existing =
      active?.projectId === id ? active.contexts.get(connection) : undefined;
    if (existing) return existing;
    const context = mockProfileSnapshot(profile, id, connection);
    if (active?.projectId === id) active.contexts.set(connection, context);
    return context;
  }
  /** Credential-free cache identity; undefined preserves the historical live cache format. */
  mockCacheKey(connection: Connection, project?: string): string | undefined {
    if (!this.simulation?.enabled || !this.isSimulated(connection, project))
      return undefined;
    const context = this.mockContext(connection, project);
    return JSON.stringify([
      context.projectId,
      context.profileId,
      context.revision,
      context.seed,
      context.clock,
      context.scenario,
    ]);
  }
  withProfile<T>(connection: Connection, fn: () => T, project?: string): T {
    if (!this.simulation?.enabled || !this.isSimulated(connection, project))
      return fn();
    const context = this.mockContext(connection, project);
    if (!this.simulation?.runSnapshot)
      throw new NetworkProfileError('NR_MOCK_PROFILE_UNAVAILABLE');
    return this.simulation.runSnapshot(context, fn);
  }
  private simulate(
    profile: MockProfile,
    project: string,
    url: string | URL,
    init: RequestInit,
  ): Promise<Response> {
    if (!this.simulation?.enabled || !this.simulation.runSnapshot)
      return Promise.reject(
        new NetworkProfileError('NR_MOCK_PROFILE_UNAVAILABLE'),
      );
    const restored = this.simulation.currentSnapshot?.();
    const context =
      restored?.projectId === project && restored.profileId === profile.id
        ? restored
        : mockProfileSnapshot(profile, project);
    return this.simulation.runSnapshot(context, () =>
      this.simulation!.request(project, url, init),
    );
  }
  fetch(
    connection: Connection,
    url: string | URL,
    init: RequestInit = {},
    project?: string,
  ): Promise<Response> {
    // Preserve the existing API: missing project selection throws synchronously, while a closed transport rejects.
    if (this.closed)
      return Promise.reject(
        Object.assign(
          new Error(
            systemMessageText('outboundNetwork.collectionNetworkShutDown'),
          ),
          {
            code: 'NR_NETWORK_CLOSED',
          },
        ),
      );
    const id = project || this.projects.getStore();
    // Reject malformed mock scopes before run() can re-enter fetch() without a selection snapshot.
    if (this.simulation?.enabled && (!id || !/^[1-9]\d{0,15}$/.test(id)))
      return Promise.reject(
        Object.assign(new NetworkProfileError('NR_MOCK_PROJECT_REQUIRED'), {
          status: 400,
        }),
      );
    // Keep the historical synchronous missing-project error for direct/proxy callers.
    if (!id) {
      this.selected(connection);
      throw new NetworkProfileError('NR_MOCK_PROJECT_REQUIRED');
    }
    if (
      this.simulation?.enabled &&
      this.selections.getStore()?.projectId !== id
    )
      return this.run(id, () => this.fetch(connection, url, init, id));
    const profile = this.profile(connection, id);
    const route = requireProfileRoute(
      profile,
      this.simulation?.enabled === true,
    );
    if (route === 'mock')
      return this.withProfile(
        connection,
        () => this.simulation!.request(id, url, init),
        id,
      );
    return this.send(profile, url, init, undefined, undefined, true);
  }
  /** Fixed deployment-owned browser collectors, not public URLs. Browser traffic stays on its host.
   * Loopback HTTP is allowed only here; every public/API path remains HTTPS-only. Never proxy a
   * local browser bridge or follow its redirects (which could forward its bearer credential).
   */
  fetchCollector(
    projectId: string,
    url: string | URL,
    init: RequestInit,
    connection?: 'bilibili' | 'xiaohongshu',
  ) {
    this.assertOpen();
    if (!/^[1-9]\d{0,15}$/.test(projectId))
      throw Object.assign(
        new Error(
          systemMessageText(
            'outboundNetwork.collectionRequestBlockedBecauseProject',
          ),
        ),
        {
          status: 400,
        },
      );
    if (connection && this.isSimulated(connection, projectId))
      return this.fetch(connection, url, init, projectId);
    if (this.simulation?.enabled)
      throw new NetworkProfileError('NR_MOCK_COLLECTOR_PROFILE_REQUIRED');
    const target = new URL(url);
    const loopback =
      target.protocol === 'http:' &&
      ['127.0.0.1', '[::1]'].includes(target.hostname);
    if (
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      (target.protocol !== 'https:' && !loopback)
    )
      throw Object.assign(
        new Error(
          systemMessageText('outboundNetwork.collectorUrlUseHttpsLocal'),
        ),
        {
          status: 400,
        },
      );
    return this.run(projectId, () =>
      this.send(
        undefined,
        target,
        { ...init, redirect: 'error' },
        undefined,
        1024 * 1024,
        false,
        loopback,
      ),
    );
  }
  async send(
    profile: NetworkProfile | undefined,
    url: string | URL,
    init: RequestInit = {},
    pinned?: { address: string; hostname: string },
    limit = 16 * 1024 * 1024,
    reuse = false,
    allowLoopback = false,
  ): Promise<Response> {
    this.assertOpen();
    requireProfileRoute(profile, this.simulation?.enabled === true);
    if (profile?.kind === 'mock') {
      const project = this.projects.getStore();
      if (!project) throw new NetworkProfileError('NR_MOCK_PROJECT_REQUIRED');
      return this.simulate(profile, project, url, init);
    }
    const target = new URL(url);
    if (
      target.protocol !== 'https:' &&
      !(
        allowLoopback &&
        target.protocol === 'http:' &&
        ['127.0.0.1', '[::1]'].includes(target.hostname)
      )
    )
      throw Object.assign(
        new Error(systemMessageText('outboundNetwork.collectionSupportsHttps')),
        { status: 400 },
      );
    const headers = new Headers(init.headers);
    if (pinned) {
      target.hostname = pinned.address;
      headers.set('host', pinned.hostname);
    }
    // Only fixed-provider fetches opt in. Connectivity tests and pinned public downloads
    // always use a fresh dispatcher, including when the same profile has an API pool.
    const transport = this.acquire(
      profile,
      target.origin,
      pinned,
      reuse && !pinned,
    );
    const { dispatcher } = transport;
    try {
      const options = {
        ...(init as unknown as UndiciRequestInit),
        headers: Object.fromEntries(headers),
        // Paid providers deliberately allow longer requests; preserve their deadline.
        signal: init.signal || AbortSignal.timeout(30000),
        dispatcher,
      };
      // fetch deliberately rewrites Host from its URL. The low-level request keeps the
      // original Host while CONNECT and TLS use the pinned IP and original SNI respectively.
      const raw = pinned
        ? await rawRequest(target, {
            headers: options.headers,
            signal: options.signal,
            dispatcher,
            method: 'GET',
          })
        : undefined;
      const response = raw
        ? {
            status: raw.statusCode,
            body: raw.body,
            headers: new Headers(raw.headers as Record<string, string>),
          }
        : await requestApi(target, options);
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (response.body)
        for await (const piece of response.body) {
          const chunk = piece as Uint8Array;
          size += chunk.byteLength;
          if (size > limit)
            throw Object.assign(new Error('body_limit'), {
              code: 'NR_RESPONSE_TOO_LARGE',
            });
          chunks.push(chunk);
        }
      return new Response(
        [204, 205, 304].includes(response.status) || init.method === 'HEAD'
          ? null
          : Buffer.concat(chunks),
        {
          status: response.status,
          headers: Object.fromEntries(response.headers),
        },
      );
    } catch (error) {
      // Keep only diagnostic names/codes; raw errors can contain URLs or credentials.
      const detail = error as {
        name?: string;
        code?: unknown;
        cause?: { code?: unknown };
      };
      const name = ['TimeoutError', 'AbortError'].includes(detail?.name ?? '')
        ? detail.name!
        : 'Error';
      const rawCode = detail?.code ?? detail?.cause?.code;
      const code =
        typeof rawCode === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(rawCode)
          ? rawCode
          : name !== 'Error'
            ? 'ETIMEDOUT'
            : 'NR_NETWORK_ERROR';
      throw Object.assign(
        new Error(
          code === 'NR_RESPONSE_TOO_LARGE'
            ? systemMessageText('outboundNetwork.responseTooLargeReduceQuery')
            : profile
              ? systemMessageText(
                  'outboundNetwork.proxyRequestFailedCheckProxy',
                )
              : systemMessageText(
                  'outboundNetwork.directRequestFailedCheckTarget',
                ),
          { cause: { code } },
        ),
        { status: 502, name, code },
      );
    } finally {
      await this.release(transport);
    }
  }
  async test(profile: NetworkProfile | undefined, connection: Connection) {
    this.assertOpen();
    const started = Date.now();
    requireProfileRoute(profile, this.simulation?.enabled === true);
    if (profile?.kind === 'mock') {
      if (!this.simulation?.runSnapshot)
        throw new NetworkProfileError('NR_MOCK_PROFILE_UNAVAILABLE');
      // Configuration readiness is not evidence of real upstream connectivity or fixture coverage.
      return {
        reachable: false,
        status: 0,
        elapsedMs: Date.now() - started,
        target: connection,
        simulated: true,
        validation: 'configuration' as const,
      };
    }
    const response = await this.send(profile, TEST_TARGETS[connection], {
      method: 'HEAD',
      signal: AbortSignal.timeout(15000),
    });
    // Authentication-required API roots can return 401/403: connectivity is separate from API credentials.
    return {
      reachable: true,
      status: response.status,
      elapsedMs: Date.now() - started,
      target: new URL(TEST_TARGETS[connection]).hostname,
    };
  }
}
