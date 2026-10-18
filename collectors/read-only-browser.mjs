/** Shared authenticated HTTP boundary for NocoReach's two read-only browser collectors.
 * The host is deliberately limited to health/search and Bilibili video. Platform modules own their fixed commands.
 */
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
const MAX_BODY = 4096;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODES = [
  'tool_missing',
  'browser_unavailable',
  'login_required',
  'security_block',
  'timeout',
  'invalid_response',
  'busy',
  'no_results',
  'cancelled',
  'rate_limited',
  'not_found',
];
export class CollectorError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function validateRequest(value, kind) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.protocolVersion !== 1 ||
    !['xiaohongshu', 'bilibili'].includes(value.platform) ||
    typeof value.projectId !== 'string' ||
    !/^[1-9]\d{0,15}$/.test(value.projectId) ||
    typeof value.requestId !== 'string' ||
    !UUID.test(value.requestId)
  )
    throw new CollectorError('invalid_response');
  const keys =
    kind === 'search'
      ? [
          'protocolVersion',
          'platform',
          'projectId',
          'requestId',
          'query',
          'limit',
        ]
      : kind === 'video'
        ? ['protocolVersion', 'platform', 'projectId', 'requestId', 'bvid']
        : ['protocolVersion', 'platform', 'projectId', 'requestId'];
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new CollectorError('invalid_response');
  if (
    kind === 'search' &&
    (typeof value.query !== 'string' ||
      value.query.trim().length < (value.platform === 'bilibili' ? 1 : 2) ||
      value.query.length > (value.platform === 'bilibili' ? 80 : 60) ||
      (value.platform === 'xiaohongshu' && /^-/.test(value.query.trim())) ||
      [...value.query].some(
        (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
      ) ||
      value.limit !== 20)
  )
    throw new CollectorError('invalid_response');
  if (
    kind === 'video' &&
    (value.platform !== 'bilibili' ||
      typeof value.bvid !== 'string' ||
      !/^BV[a-zA-Z0-9]{10}$/.test(value.bvid))
  )
    throw new CollectorError('invalid_response');
  return value;
}
export function createReadOnlyCollector({
  token,
  platforms,
  now = () => new Date().toISOString(),
}) {
  if (
    typeof token !== 'string' ||
    token.length < 32 ||
    token.length > 256 ||
    !/^[\x21-\x7e]+$/.test(token)
  )
    throw new Error('Set a private collector token of at least 32 characters.');
  const expected = Buffer.from(`Bearer ${token}`);
  let busy = false;
  const server = createServer(async (req, res) => {
    const reply = (status, data) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(data));
    };
    const actual = Buffer.from(String(req.headers.authorization ?? ''));
    if (
      req.headers.origin ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      reply(401, { error: 'unauthorized' });
      return;
    }
    const kind =
      req.url === '/health'
        ? 'health'
        : req.url === '/search'
          ? 'search'
          : req.url === '/video'
            ? 'video'
            : null;
    if (req.method !== 'POST' || !kind) {
      reply(404, { error: 'not_found' });
      return;
    }
    if (
      !String(req.headers['content-type'] ?? '').startsWith('application/json')
    ) {
      reply(415, { error: 'json_required' });
      return;
    }
    let input;
    try {
      const parts = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) {
          reply(413, { error: 'body_limit' });
          return;
        }
        parts.push(chunk);
      }
      input = validateRequest(
        JSON.parse(Buffer.concat(parts).toString('utf8')),
        kind,
      );
    } catch {
      reply(400, { error: 'invalid_request' });
      return;
    }
    const handlers = platforms?.[input.platform];
    if (!handlers || typeof handlers[kind] !== 'function') {
      reply(404, { error: 'unsupported_platform_action' });
      return;
    }
    const envelope = {
      protocolVersion: 1,
      platform: input.platform,
      projectId: input.projectId,
      requestId: input.requestId,
    };
    if (busy) {
      reply(200, { ...envelope, ok: false, errorCode: 'busy' });
      return;
    }
    busy = true;
    const controller = new globalThis.AbortController();
    const disconnected = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', disconnected);
    try {
      if (kind === 'health') {
        const health = await handlers.health(controller.signal);
        const anonymous =
          input.platform === 'bilibili' &&
          health?.upstream === 'anonymous-http';
        if (
          anonymous &&
          (health.platformVerified !== false ||
            health.browser !== 'not_required' ||
            health.login !== 'not_used')
        )
          throw new CollectorError('invalid_response');
        reply(200, {
          ...envelope,
          ok: true,
          kind,
          ...(anonymous
            ? {
                upstream: 'anonymous-http',
                platformVerified: false,
                browser: 'not_required',
                login: 'not_used',
              }
            : {
                toolInstalled: true,
                browser: 'unchecked',
                login: 'unchecked',
              }),
        });
      } else if (kind === 'search') {
        const items = await handlers.search(
          { query: input.query, limit: input.limit },
          controller.signal,
        );
        if (
          !Array.isArray(items) ||
          items.length > 20 ||
          Buffer.byteLength(JSON.stringify(items)) > 20 * 1024 * 1024
        )
          throw new CollectorError('invalid_response');
        if (!items.length) throw new CollectorError('no_results');
        reply(200, { ...envelope, ok: true, kind, collectedAt: now(), items });
      } else {
        const item = await handlers.video(
          { bvid: input.bvid },
          controller.signal,
        );
        if (
          !item ||
          typeof item !== 'object' ||
          Array.isArray(item) ||
          Buffer.byteLength(JSON.stringify(item)) > 20 * 1024 * 1024
        )
          throw new CollectorError('invalid_response');
        reply(200, { ...envelope, ok: true, kind, collectedAt: now(), item });
      }
    } catch (error) {
      // Neither stderr nor arguments are logged or returned: either can contain user data.
      reply(200, {
        ...envelope,
        ok: false,
        errorCode:
          error instanceof CollectorError && ERROR_CODES.includes(error.code)
            ? error.code
            : 'invalid_response',
      });
    } finally {
      busy = false;
      res.off('close', disconnected);
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
