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
  private apiDispatchers = new Map<string, Transport>();
  private transports = new Set<Transport>();
  private closed = false;
  constructor(readonly profiles: ProxyProfiles) {}

  private acquire(
    profile: ProxyProfile | undefined,
    origin: string,
    pinned: { hostname: string } | undefined,
    reuse: boolean,
  ): Transport {
    if (this.closed)
      throw Object.assign(new Error('采集网络已关闭'), {
        code: 'NR_NETWORK_CLOSED',
      });
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
    return this.projects.run(String(id), fn);
  }
  // Classic collectors have URL-only helpers. Bind their project entry points once so nested
  // helpers and fire-and-forget work retain the project even when several projects run concurrently.
  bind(service: object, methods: string[]) {
    for (const name of methods) {
      const original = (service as Record<string, unknown>)[name];
      if (typeof original !== 'function')
        throw new Error(`Unknown collector method: ${name}`);
      const method = original as (id: string, ...args: unknown[]) => unknown;
      Reflect.set(service, name, (id: string, ...args: unknown[]) =>
        this.run(id, () => method.call(service, id, ...args)),
      );
    }
  }
  selected(connection: Connection) {
    const id = this.projects.getStore();
    if (!id)
      throw Object.assign(new Error('采集请求缺少项目范围，已阻止请求'), {
        status: 500,
      });
    return this.profiles.resolve(id, connection);
  }
  fetch(
    connection: Connection,
    url: string | URL,
    init: RequestInit = {},
    project?: string,
  ) {
    const profile = project
      ? this.profiles.resolve(project, connection)
      : this.selected(connection);
    return this.send(profile, url, init, undefined, undefined, true);
  }
  async send(
    profile: ProxyProfile | undefined,
    url: string | URL,
    init: RequestInit = {},
    pinned?: { address: string; hostname: string },
    limit = 16 * 1024 * 1024,
    reuse = false,
  ): Promise<Response> {
    const target = new URL(url);
    if (target.protocol !== 'https:')
      throw Object.assign(new Error('采集仅支持 HTTPS'), { status: 400 });
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
            ? '来源响应超过大小限制，请缩小查询范围后重试'
            : profile
              ? '代理请求未完成，请检查代理和目标网络；未切换直连'
              : '直连请求未完成，请检查目标网络',
          { cause: { code } },
        ),
        { status: 502, name, code },
      );
    } finally {
      await this.release(transport);
    }
  }
  async test(profile: ProxyProfile | undefined, connection: Connection) {
    const started = Date.now();
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
