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
