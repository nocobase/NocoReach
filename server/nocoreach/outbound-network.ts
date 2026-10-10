import { AsyncLocalStorage } from 'node:async_hooks';
import {
  Agent,
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

/** Instance-local scope: never changes Studio's global fetch, environment or dispatcher. */
export class OutboundNetwork {
  private projects = new AsyncLocalStorage<string>();
  constructor(readonly profiles: ProxyProfiles) {}
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
    return this.send(profile, url, init);
  }
  async send(
    profile: ProxyProfile | undefined,
    url: string | URL,
    init: RequestInit = {},
    pinned?: { address: string; hostname: string },
    limit = 16 * 1024 * 1024,
  ): Promise<Response> {
    const target = new URL(url);
    if (target.protocol !== 'https:')
      throw Object.assign(new Error('采集仅支持 HTTPS'), { status: 400 });
    const headers = new Headers(init.headers);
    if (pinned) {
      target.hostname = pinned.address;
      headers.set('host', pinned.hostname);
    }
    const dispatcher = profile
      ? new ProxyAgent({
          uri: profile.url,
          ...(profile.username
            ? {
                token: `Basic ${Buffer.from(`${profile.username}:${profile.password}`).toString('base64')}`,
              }
            : {}),
          requestTls: pinned ? { servername: pinned.hostname } : undefined,
        })
      : new Agent();
    try {
      const options = {
        ...(init as unknown as UndiciRequestInit),
        headers: Object.fromEntries(headers),
        redirect: 'manual' as const,
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
        : await request(target, options);
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (response.body)
        for await (const piece of response.body) {
          const chunk = piece as Uint8Array;
          size += chunk.byteLength;
          if (size > limit) throw new Error('body_limit');
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
    } catch {
      throw Object.assign(
        new Error(
          profile
            ? '代理请求未完成，请检查代理和目标网络；未切换直连'
            : '直连请求未完成，请检查目标网络',
        ),
        { status: 502 },
      );
    } finally {
      await dispatcher.destroy();
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
