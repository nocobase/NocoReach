/** Optional anonymous, read-only public Web API upstream (not an official API).
 * No cookies, identity generation, browser impersonation, redirects or retries.
 * WBI parameter format adapted from bpi-py (MIT); see licenses/bpi-py.txt.
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import { TextDecoder } from 'node:util';
import { CollectorError } from './read-only-browser.mjs';
import {
  createBilibiliHandlers,
  normalizeSearchOutput,
  normalizeVideoOutput,
  searchArguments,
  videoArguments,
} from './bilibili.mjs';

const ORIGIN = 'https://api.bilibili.com';
const PATHS = {
  nav: '/x/web-interface/nav',
  search: '/x/web-interface/wbi/search/type',
  video: '/x/web-interface/view',
};
const MAX_RESPONSE = 20 * 1024 * 1024;
const TIMEOUT = 20000;
const MIXIN = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];
const fail = (code = 'invalid_response') => {
  throw new CollectorError(code);
};
const record = (v) => v && typeof v === 'object' && !Array.isArray(v);
function publicKey(value) {
  if (typeof value !== 'string' || value.length > 2048) return fail();
  let url;
  try {
    url = new URL(value);
  } catch {
    return fail();
  }
  // These URLs supply public signing material only. They are never requested.
  const key = url.pathname.match(/\/([a-f\d]{32})\.(?:png|webp)$/i)?.[1];
  if (!key || url.protocol !== 'https:' || url.username || url.password)
    return fail();
  return key;
}
function signedSearch(query, data, now) {
  if (data.isLogin !== false || !record(data.wbi_img)) return fail();
  const keys =
    publicKey(data.wbi_img.img_url) + publicKey(data.wbi_img.sub_url);
  const mixin = MIXIN.map((i) => keys[i])
    .join('')
    .slice(0, 32);
  const timestamp = Math.floor(now() / 1000);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) return fail();
  const params = {
    search_type: 'video',
    keyword: query.replace(/[!'()*]/g, ''),
    page: '1',
    page_size: '20',
    order: 'totalrank',
    duration: '0',
    tids: '0',
    wts: String(timestamp),
  };
  if (!params.keyword.trim()) return fail();
  const encoded = Object.keys(params)
    .sort()
    .map(
      (key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`,
    )
    .join('&');
  // Public request checksum, never an authentication token or cryptographic secret.
  const signature = createHash('md5')
    .update(encoded + mixin)
    .digest('hex');
  return `${encoded}&w_rid=${signature}`;
}
function titleText(value) {
  if (typeof value !== 'string') return null;
  // Bound raw highlight markup before regex decoding, not only the output title.
  // Malformed long titles fail closed instead of consuming the operation deadline.
  if (value.length > 4096) return fail();
  const entities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  // Decode after removing upstream highlight markup; callers render plain text.
  return value
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (original, entity) => {
        if (!entity.startsWith('#')) return entities[entity.toLowerCase()];
        const hex = entity.slice(0, 2).toLowerCase() === '#x';
        const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return point > 0 &&
          point <= 0x10ffff &&
          !(point >= 0xd800 && point <= 0xdfff)
          ? String.fromCodePoint(point)
          : original;
      },
    );
}
function searchItems(data) {
  if (!Array.isArray(data.result) || data.result.length > 20) return fail();
  const rows = data.result.map((row) => {
    if (!record(row)) return fail();
    videoArguments(row.bvid);
    return {
      url: `https://www.bilibili.com/video/${row.bvid}/`,
      title: titleText(row.title),
      score: row.play,
    };
  });
  // Keep protocol v1's conservative search metrics and unknown timestamp semantics.
  return normalizeSearchOutput(JSON.stringify(rows));
}
function videoItem(data, bvid) {
  if (data.bvid !== bvid || (data.stat != null && !record(data.stat)))
    return fail();
  const ms =
    typeof data.pubdate === 'number' &&
    Number.isSafeInteger(data.pubdate) &&
    data.pubdate >= 0
      ? data.pubdate * 1000
      : NaN;
  const date = new Date(ms);
  const time = Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 16).replace('T', ' ')
    : null;
  return normalizeVideoOutput(
    JSON.stringify([
      { field: 'bvid', value: bvid },
      { field: 'title', value: data.title },
      { field: 'view', value: data.stat?.view },
      { field: 'like', value: data.stat?.like },
      { field: 'reply', value: data.stat?.reply },
      { field: 'publish_time', value: time },
    ]),
    bvid,
  );
}
function envelope(body, kind) {
  if (!record(body) || !Number.isSafeInteger(body.code)) return fail();
  // Check every envelope diagnostic independently: a benign message must not
  // hide a refusal in msg/showMsg. Never inspect titles or other user content.
  const rawDiagnostics = ['message', 'msg', 'showMsg']
    .map((key) => body[key])
    .filter((value) => typeof value === 'string');
  const diagnostics = rawDiagnostics.map((value) => value.slice(0, 1000));
  // A challenge must never be accepted as an empty success or an anonymous-nav exception.
  if (
    diagnostics.some((value) =>
      /captcha|challenge|验证码|风控|安全验证|access denied/i.test(value),
    ) ||
    body.v_voucher ||
    body.data?.v_voucher
  )
    return fail('security_block');
  if ([429, -429, -509, -799].includes(body.code)) return fail('rate_limited');
  if ([403, -403, 412, -412, -352].includes(body.code))
    return fail('security_block');
  if (body.code === -404) return fail('not_found');
  const anonymousNav =
    kind === 'nav' &&
    body.code === -101 &&
    body.data?.isLogin === false &&
    record(body.data?.wbi_img);
  if (
    (!anonymousNav && [-101, -111, 401].includes(body.code)) ||
    diagnostics.some(
      (value) =>
        /登录|login required|not logged in|sign in/i.test(value) &&
        // The saved anonymous nav reports status, not a request to authenticate.
        !(anonymousNav && value.trim() === '账号未登录'),
    )
  )
    return fail('login_required');
  // Never accept success with an uninspected diagnostic tail.
  if (rawDiagnostics.some((value) => value.length > 1000)) return fail();
  if ((body.code !== 0 && !anonymousNav) || !record(body.data)) return fail();
  return body.data;
}
/** Function injection is a local test seam, never an HTTP/configurable URL or header. */
export function createBilibiliPublicHttpHandlers({
  fetcher = globalThis.fetch,
  now = Date.now,
} = {}) {
  if (typeof fetcher !== 'function')
    throw new Error('A fetch implementation is required.');
  async function operation(signal, work) {
    if (signal?.aborted) return fail('cancelled');
    const controller = new globalThis.AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    const timer = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    async function request(kind, query = '') {
      if (controller.signal.aborted)
        return fail(timedOut ? 'timeout' : 'cancelled');
      const response = await fetcher(
        `${ORIGIN}${PATHS[kind]}${query ? `?${query}` : ''}`,
        {
          method: 'GET',
          redirect: 'error',
          credentials: 'omit',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'NocoReach-Public-Research/1.0',
          },
        },
      );
      if (response.status === 429) return fail('rate_limited');
      if ([403, 412].includes(response.status)) return fail('security_block');
      if (response.status === 401) return fail('login_required');
      if (response.status === 404) return fail('not_found');
      if (!response.ok || response.redirected) return fail();
      const length = response.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE))
        return fail();
      if (!response.body) return fail();
      const reader = response.body.getReader();
      const parts = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted)
            return fail(timedOut ? 'timeout' : 'cancelled');
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE) return fail();
          parts.push(value);
        }
      } finally {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.concat(parts),
      );
      if (/^\s*</.test(raw)) {
        if (/captcha|challenge|验证码|风控|安全验证|access denied/i.test(raw))
          return fail('security_block');
        if (/登录|login required|sign in/i.test(raw))
          return fail('login_required');
        return fail();
      }
      if (
        !/^application\/(?:json|[a-z\d.+-]+\+json)(?:;|$)/i.test(
          response.headers.get('content-type') || '',
        )
      )
        return fail();
      return envelope(JSON.parse(raw), kind);
    }
    try {
      const result = await work(request);
      if (signal?.aborted) return fail('cancelled');
      if (timedOut) return fail('timeout');
      return result;
    } catch (error) {
      if (signal?.aborted) return fail('cancelled');
      if (timedOut) return fail('timeout');
      throw new CollectorError(
        error instanceof CollectorError ? error.code : 'invalid_response',
      );
    } finally {
      controller.abort();
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return {
    async health(signal) {
      if (signal?.aborted) return fail('cancelled');
      // Local capability only: no platform request, browser, login or tool installation.
      return {
        upstream: 'anonymous-http',
        platformVerified: false,
        browser: 'not_required',
        login: 'not_used',
      };
    },
    async search({ query, limit }, signal) {
      if (limit !== 20) return fail();
      searchArguments(query);
      if (!query.replace(/[!'()*]/g, '').trim()) return fail();
      return operation(signal, async (request) => {
        const nav = await request('nav');
        return searchItems(
          await request('search', signedSearch(query.trim(), nav, now)),
        );
      });
    },
    async video({ bvid }, signal) {
      videoArguments(bvid);
      return operation(signal, async (request) =>
        videoItem(await request('video', `bvid=${bvid}`), bvid),
      );
    },
  };
}
export function createBilibiliUpstreamHandlers({
  upstream = 'opencli',
  ...options
} = {}) {
  if (upstream === 'opencli') return createBilibiliHandlers(options);
  if (upstream === 'anonymous-http')
    return createBilibiliPublicHttpHandlers(options);
  throw new Error('Select Bilibili upstream: opencli or anonymous-http.');
}
