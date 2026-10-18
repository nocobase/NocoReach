/** Thin, authenticated read-only adapter for an already installed OpenCLI.
 * No account setup, cookie access, tool installation, polling or task queue.
 * Start: NOCOREACH_XHS_COLLECTOR_TOKEN=<private value> node collectors/xiaohongshu.mjs
 */
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { clearTimeout, setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

import {
  CollectorError,
  createReadOnlyCollector,
} from './read-only-browser.mjs';
const MAX_OUTPUT = 20 * 1024 * 1024;
export function failureCode(error) {
  if (error instanceof CollectorError) return error.code;
  if (error?.name === 'AbortError') return 'cancelled';
  if (error?.code === 'ENOENT') return 'tool_missing';
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
    return 'invalid_response';
  if (error?.killed || error?.code === 75) return 'timeout';
  // The upstream CLI error code is more specific than the process exit status.
  const diagnostic = String(error?.stderr ?? '').slice(0, 10000);
  if (/SECURITY_BLOCK|安全限制|验证码/.test(diagnostic))
    return 'security_block';
  if (error?.code === 77 || /AUTH_REQUIRED/.test(diagnostic))
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
      clearTimeout(deadline);
      clearTimeout(escalation);
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
      escalation = setTimeout(() => {
        if (!closed) child.kill('SIGKILL');
      }, 1000);
    };
    const abort = () => stop('cancelled');
    const deadline = setTimeout(() => stop('timeout'), 75000);
    child.once('close', () => {
      closed = true;
      finish();
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
export function searchArguments(query, profile = '') {
  if (
    typeof query !== 'string' ||
    query.trim().length < 2 ||
    query.length > 60 ||
    /^-/.test(query.trim()) ||
    [...query].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new CollectorError('invalid_response');
  if (profile && !/^[a-zA-Z0-9_-]{1,64}$/.test(profile))
    throw new CollectorError('invalid_response');
  return [
    ...(profile ? ['--profile', profile] : []),
    'xiaohongshu',
    'search',
    query.trim(),
    '--limit',
    '20',
    '--format',
    'json',
  ];
}
/** The only injectable boundary is a local function for tests, never an HTTP setting. */
export function createXiaohongshuHandlers({
  profile = '',
  run = execute,
} = {}) {
  searchArguments('检查参数', profile);
  return {
    async health(signal) {
      try {
        const version = String(await run(['--version'], signal)).trim();
        if (!/\d+\.\d+\.\d+/.test(version))
          throw new CollectorError('invalid_response');
      } catch (error) {
        throw new CollectorError(failureCode(error));
      }
    },
    async search(input, signal) {
      try {
        const output = String(
          await run(searchArguments(input.query, profile), signal),
        );
        if (Buffer.byteLength(output) > MAX_OUTPUT)
          throw new CollectorError('invalid_response');
        const rows = JSON.parse(output);
        if (!Array.isArray(rows) || rows.length > 20)
          throw new CollectorError('invalid_response');
        if (!rows.length) throw new CollectorError('no_results');
        // Do not transmit authors or arbitrary upstream fields to the NocoReach server.
        return rows.map((row) => {
          if (!row || typeof row !== 'object')
            throw new CollectorError('invalid_response');
          return {
            title: row.title,
            url: row.url,
            likes: row.likes ?? null,
            published_at: row.published_at ?? null,
          };
        });
      } catch (error) {
        throw new CollectorError(failureCode(error));
      }
    },
  };
}

export function createCollector({ token, profile = '', run = execute, now }) {
  return createReadOnlyCollector({
    token,
    now,
    platforms: { xiaohongshu: createXiaohongshuHandlers({ profile, run }) },
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.NOCOREACH_XHS_COLLECTOR_PORT || '18061');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid collector port.');
  const server = createCollector({
    token: process.env.NOCOREACH_XHS_COLLECTOR_TOKEN,
    profile: process.env.NOCOREACH_XHS_OPENCLI_PROFILE || '',
  });
  server.listen(port, '127.0.0.1', () =>
    process.stdout.write(
      `NocoReach read-only Xiaohongshu collector: http://127.0.0.1:${port}\n`,
    ),
  );
}
