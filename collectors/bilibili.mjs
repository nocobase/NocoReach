/** Read-only Bilibili handler for an already installed OpenCLI.
 * Uses native search/video commands; never installs software, reads cookie files,
 * invokes a shell, retries a refusal, or accepts a user-supplied command/URL.
 * OpenCLI 1.8.8's lossy search output is intentionally treated as incomplete.
 */
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { execFile } from 'node:child_process';
import { CollectorError } from './read-only-browser.mjs';

const MAX_OUTPUT = 1024 * 1024;
const BV = /^BV[a-zA-Z0-9]{10}$/;
const fail = (code = 'invalid_response') => {
  throw new CollectorError(code);
};
const record = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const text = (value) =>
  typeof value === 'string' ? value.trim().slice(0, 500) || null : null;
const count = (value) => {
  if (
    typeof value !== 'number' &&
    !(typeof value === 'string' && /^\d+$/.test(value))
  )
    return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};
function readJson(output) {
  if (typeof output !== 'string' || Buffer.byteLength(output) > MAX_OUTPUT)
    return fail();
  try {
    return JSON.parse(output);
  } catch {
    return fail();
  }
}
export function searchArguments(query) {
  if (
    typeof query !== 'string' ||
    query.trim().length < 1 ||
    query.length > 80 ||
    [...query].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return fail();
  // Options precede the positional separator, so even '-topic' remains one argument.
  return [
    'bilibili',
    'search',
    '--type',
    'video',
    '--page',
    '1',
    '--limit',
    '20',
    '--format',
    'json',
    '--',
    query.trim(),
  ];
}
export function videoArguments(bvid) {
  if (typeof bvid !== 'string' || !BV.test(bvid)) return fail();
  return ['bilibili', 'video', '--format', 'json', '--', bvid];
}
function searchBvid(value) {
  if (typeof value !== 'string' || value.length > 2048) return fail();
  let url;
  try {
    url = new URL(value);
  } catch {
    return fail();
  }
  const match = url.pathname.match(/^\/video\/(BV[a-zA-Z0-9]{10})\/?$/);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.bilibili.com' ||
    url.username ||
    url.password ||
    url.port ||
    !match
  )
    return fail();
  return match[1];
}
export function normalizeSearchOutput(output) {
  const rows = readJson(output);
  if (!Array.isArray(rows) || rows.length > 20) return fail();
  // Native search silently substitutes [] for certain failed upstream envelopes.
  // No positive platform-verification claim can be made from an empty array.
  if (!rows.length) return fail('no_results');
  const videos = new Map();
  for (const row of rows) {
    if (!record(row)) return fail();
    const bvid = searchBvid(row.url);
    const views = count(row.score);
    videos.set(bvid, {
      bvid,
      title: text(row.title),
      // Native search substitutes 0 for an absent play count. Its ambiguity is irrecoverable.
      views: views === 0 ? null : views,
      likes: null,
      comments: null,
      publishedAt: null,
      publishedAtPrecision: null,
      completeness: 'search_summary',
    });
  }
  return [...videos.values()];
}
export function normalizeVideoOutput(output, expectedBvid) {
  videoArguments(expectedBvid);
  const rows = readJson(output);
  if (!Array.isArray(rows) || rows.length > 64) return fail();
  const fields = new Map();
  for (const row of rows) {
    if (!record(row) || typeof row.field !== 'string' || fields.has(row.field))
      return fail();
    fields.set(row.field, row.value);
  }
  if (fields.get('bvid') !== expectedBvid) return fail();
  let publishedAt = null;
  const time = fields.get('publish_time');
  // OpenCLI formats toISOString() as UTC, dropping seconds and the timezone suffix.
  if (
    typeof time === 'string' &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time)
  ) {
    const iso = `${time.replace(' ', 'T')}:00.000Z`;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms) && new Date(ms).toISOString() === iso)
      publishedAt = iso;
  }
  return {
    bvid: expectedBvid,
    title: text(fields.get('title')),
    views: count(fields.get('view')),
    likes: count(fields.get('like')),
    comments: count(fields.get('reply')),
    publishedAt,
    publishedAtPrecision: publishedAt ? 'minute' : null,
    completeness: 'video_metadata',
  };
}
export function failureCode(error) {
  if (error instanceof CollectorError) return error.code;
  if (error?.name === 'AbortError') return 'cancelled';
  if (error?.code === 'ENOENT') return 'tool_missing';
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
    return 'invalid_response';
  if (error?.killed || error?.code === 75) return 'timeout';
  // Read only enough diagnostics to classify; never log or return the raw content.
  const diagnostic = String(error?.stderr ?? '').slice(0, 10000);
  if (/\b429\b|RATE_LIMIT|请求过于频繁/i.test(diagnostic))
    return 'rate_limited';
  if (
    /\b(?:403|412)\b|SECURITY_BLOCK|安全限制|验证码|风控|access denied/i.test(
      diagnostic,
    )
  )
    return 'security_block';
  if (/\(-404\)|视频不存在|视频已删除/.test(diagnostic)) return 'not_found';
  if (error?.code === 77 || /AUTH_REQUIRED|\(-101\)|登录/.test(diagnostic))
    return 'login_required';
  if (
    error?.code === 69 ||
    /BROWSER_UNAVAILABLE|BRIDGE_UNAVAILABLE/.test(diagnostic)
  )
    return 'browser_unavailable';
  if (error?.code === 66) return 'no_results';
  return 'invalid_response';
}
function execute(args, signal) {
  if (signal?.aborted) return Promise.reject(new CollectorError('cancelled'));
  return new Promise((resolve, reject) => {
    let closed = false;
    let result;
    let stopped;
    let escalation;
    const finish = () => {
      // AbortSignal's execFile callback can run before the process exits. Keep
      // the host's shared busy slot until both output and process close exist.
      if (!closed || !result) return;
      globalThis.clearTimeout(deadline);
      globalThis.clearTimeout(escalation);
      signal?.removeEventListener('abort', abort);
      if (stopped) reject(new CollectorError(stopped));
      else if (result.error) {
        result.error.stderr = result.stderr;
        reject(result.error);
      } else resolve(result.stdout);
    };
    const child = execFile(
      'opencli',
      args,
      {
        shell: false,
        maxBuffer: MAX_OUTPUT,
        // maxBuffer overflow must also terminate an uncooperative process.
        killSignal: 'SIGKILL',
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        result = { error, stdout, stderr };
        finish();
      },
    );
    const stop = (reason) => {
      if (closed || stopped) return;
      stopped = reason;
      child.kill('SIGTERM');
      // Cancellation and the deadline share bounded escalation. A successful
      // kill request alone is not proof of exit; only close releases the slot.
      escalation = globalThis.setTimeout(() => {
        if (!closed) child.kill('SIGKILL');
      }, 1000);
    };
    const abort = () => stop('cancelled');
    const deadline = globalThis.setTimeout(() => stop('timeout'), 75000);
    child.once('close', () => {
      closed = true;
      finish();
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
/** Test seam is a local function only. No request/config parameter changes the executable. */
export function createBilibiliHandlers({ run = execute } = {}) {
  const call = async (args, signal) => {
    if (signal?.aborted) return fail('cancelled');
    try {
      const result = await run(args, signal);
      if (signal?.aborted) return fail('cancelled');
      return result;
    } catch (error) {
      throw new CollectorError(failureCode(error));
    }
  };
  return {
    async health(signal) {
      const version = String(await call(['--version'], signal)).trim();
      if (!/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version))
        return fail();
    },
    async search({ query, limit }, signal) {
      if (limit !== 20) return fail();
      return normalizeSearchOutput(await call(searchArguments(query), signal));
    },
    async video({ bvid }, signal) {
      return normalizeVideoOutput(
        await call(videoArguments(bvid), signal),
        bvid,
      );
    },
  };
}
