// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { createReadOnlyCollector } from '../../collectors/read-only-browser.mjs';
import {
  createBilibiliHandlers,
  failureCode,
  normalizeSearchOutput,
  normalizeVideoOutput,
  searchArguments,
  videoArguments,
} from '../../collectors/bilibili.mjs';
import { createBrowserResearchCollector } from '../../collectors/browser-research.mjs';
import { HttpBilibiliAdapter } from '../../server/nocoreach/bilibili-adapter';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network';
import type { BrowserCollectorConfig } from '../../server/nocoreach/browser-collector-config';
const BV = 'BV1MW421X7gM';
const token = 'synthetic-only-readonly-collector-test-token';
const servers: Server[] = [],
  networks: OutboundNetwork[] = [];
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};
const rows = [
  {
    title: 'Demo',
    url: `https://www.bilibili.com/video/${BV}`,
    score: 0,
    author: 'PRIVATE PERSON',
    cookie: 'PRIVATE COOKIE',
  },
];
const detailRows = [
  { field: 'bvid', value: BV },
  { field: 'title', value: 'Demo' },
  { field: 'view', value: '0' },
  { field: 'publish_time', value: '2026-01-03 12:34' },
  { field: 'description', value: 'PRIVATE DESCRIPTION' },
];
const body = (extra = {}) => ({
  protocolVersion: 1,
  platform: 'bilibili',
  projectId: '1',
  requestId: randomUUID(),
  ...extra,
});
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  await Promise.all(networks.splice(0).map((n) => n.close()));
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections();
          s.close(() => r());
        }),
    ),
  );
});
it('constructs only fixed read commands with positional separator; never treats user input as flags or URLs', () => {
  expect(searchArguments('-topic; $(echo secret)')).toEqual([
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
    '-topic; $(echo secret)',
  ]);
  expect(videoArguments(BV)).toEqual([
    'bilibili',
    'video',
    '--format',
    'json',
    '--',
    BV,
  ]);
  for (const q of ['', 'a'.repeat(81), 'a\ncommand'])
    expect(() => searchArguments(q)).toThrow();
  for (const id of [
    'https://b23.tv/abc',
    `https://evil.test/${BV}`,
    `${BV};echo secret`,
  ])
    expect(() => videoArguments(id)).toThrow();
});
it('marks lossy search zero unknown, drops identity/credentials and canonicalizes only valid video results', () => {
  expect(normalizeSearchOutput(JSON.stringify(rows))).toEqual([
    {
      bvid: BV,
      title: 'Demo',
      views: null,
      likes: null,
      comments: null,
      publishedAt: null,
      publishedAtPrecision: null,
      completeness: 'search_summary',
    },
  ]);
  expect(
    normalizeSearchOutput(JSON.stringify([{ ...rows[0], score: 17 }]))[0].views,
  ).toBe(17);
  expect(() => normalizeSearchOutput('[]')).toThrowError('no_results');
  expect(() => normalizeSearchOutput('{"code":-352}')).toThrow();
  expect(() =>
    normalizeSearchOutput(
      JSON.stringify([{ ...rows[0], url: 'https://127.0.0.1' }]),
    ),
  ).toThrow();
});
it('preserves known detail zero and UTC minute precision, allows missing optional fields, rejects mismatched/duplicate IDs', () => {
  expect(normalizeVideoOutput(JSON.stringify(detailRows), BV)).toMatchObject({
    bvid: BV,
    views: 0,
    likes: null,
    publishedAt: '2026-01-03T12:34:00.000Z',
    publishedAtPrecision: 'minute',
  });
  expect(
    normalizeVideoOutput(JSON.stringify([{ field: 'bvid', value: BV }]), BV),
  ).toMatchObject({ title: null, views: null });
  expect(() =>
    normalizeVideoOutput(JSON.stringify([...detailRows, detailRows[0]]), BV),
  ).toThrow();
  expect(() =>
    normalizeVideoOutput(JSON.stringify(detailRows), 'BV1ABcsztEcY'),
  ).toThrow();
});
it('classifies refusal and missing tools without exposing diagnostics; does not retry or fall back', async () => {
  for (const [stderr, code] of [
    ['HTTP 412 SECRET', 'security_block'],
    ['HTTP 429 SECRET', 'rate_limited'],
    ['failed (-404)', 'not_found'],
    ['failed (-101)', 'login_required'],
  ])
    expect(failureCode({ stderr })).toBe(code);
  expect(failureCode({ code: 'ENOENT' })).toBe('tool_missing');
  const run = vi.fn(async () => {
    throw Object.assign(new Error('SECRET'), { stderr: 'HTTP 412 SECRET' });
  });
  await expect(
    createBilibiliHandlers({ run }).search({ query: 'Demo', limit: 20 }),
  ).rejects.toMatchObject({ code: 'security_block' });
  expect(run).toHaveBeenCalledTimes(1);
});
it('health checks only tool version and cancellation discards a late successful runner output', async () => {
  const run = vi.fn(async () => '1.8.8');
  await createBilibiliHandlers({ run }).health();
  expect(run).toHaveBeenCalledWith(['--version'], undefined);
  const controller = new AbortController();
  const handlers = createBilibiliHandlers({
    run: async () => {
      controller.abort();
      return JSON.stringify(rows);
    },
  });
  await expect(
    handlers.search({ query: 'Demo', limit: 20 }, controller.signal),
  ).rejects.toMatchObject({ code: 'cancelled' });
});
it('runs real HTTP host → fixed runner → typed application adapter with no platform calls or credentials', async () => {
  const run = vi.fn(async (args: string[]) =>
    args[0] === '--version'
      ? '1.8.8'
      : JSON.stringify(args[1] === 'video' ? detailRows : rows),
  );
  const url = await listen(
    createReadOnlyCollector({
      token,
      platforms: { bilibili: createBilibiliHandlers({ run }) },
    }),
  );
  const network = new OutboundNetwork({} as never);
  networks.push(network);
  const adapter = new HttpBilibiliAdapter(network);
  const config: BrowserCollectorConfig = {
    id: 'local',
    name: 'Local',
    url,
    token,
    platforms: ['bilibili'],
    projectIds: ['1'],
  };
  const request = { projectId: '1', requestId: randomUUID() };
  expect(await adapter.health(config, request)).toEqual({
    toolInstalled: true,
    browser: 'unchecked',
    login: 'unchecked',
  });
  expect(
    (await adapter.search(config, { ...request, query: '中' })).items[0],
  ).toMatchObject({ bvid: BV, views: null });
  expect(
    (await adapter.video(config, { ...request, bvid: BV })).items[0],
  ).toMatchObject({ bvid: BV, views: 0, publishedAtPrecision: 'minute' });
  expect(run).toHaveBeenCalledTimes(3);
});
it('host rejects missing auth/origin, arbitrary fields/URLs and unregistered platform before invoking any runner', async () => {
  const run = vi.fn();
  const url = await listen(
    createReadOnlyCollector({
      token,
      platforms: { bilibili: createBilibiliHandlers({ run }) },
    }),
  );
  expect(
    (
      await fetch(`${url}/health`, {
        method: 'POST',
        body: JSON.stringify(body()),
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await fetch(`${url}/health`, {
        method: 'POST',
        headers: { ...headers, Origin: 'https://evil.test' },
        body: JSON.stringify(body()),
      })
    ).status,
  ).toBe(401);
  for (const extra of [
    { command: 'rm' },
    { url: 'http://127.0.0.1' },
    { bvid: `https://www.bilibili.com/video/${BV}` },
  ])
    expect(
      (
        await fetch(`${url}/video`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body({ bvid: BV, ...extra })),
        })
      ).status,
    ).toBe(400);
  expect(
    (
      await fetch(`${url}/health`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body({ platform: 'xiaohongshu' })),
      })
    ).status,
  ).toBe(404);
  expect(run).not.toHaveBeenCalled();
});
it('ambiguous empty and refusal remain typed failures over the real HTTP boundary, with no stderr disclosure', async () => {
  for (const failure of [false, true]) {
    const run = vi.fn(async () => {
      if (failure)
        throw Object.assign(new Error('secret'), {
          stderr: 'HTTP 412 PRIVATE COOKIE',
        });
      return '[]';
    });
    const url = await listen(
      createReadOnlyCollector({
        token,
        platforms: { bilibili: createBilibiliHandlers({ run }) },
      }),
    );
    const response = await fetch(`${url}/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body({ query: 'Demo', limit: 20 })),
    });
    const value = await response.json();
    expect(value).toMatchObject({
      ok: false,
      errorCode: failure ? 'security_block' : 'no_results',
    });
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
    expect(run).toHaveBeenCalledTimes(1);
  }
});
it('shared static composition keeps platforms separate and enforces one active browser operation', async () => {
  let release!: (s: string) => void;
  const pending = new Promise<string>((r) => {
    release = r;
  });
  const bili = vi.fn(async () => pending),
    xhs = vi.fn(async () => '1.8.8');
  const url = await listen(
    createBrowserResearchCollector({
      token,
      platforms: ['bilibili', 'xiaohongshu'],
      bilibili: { run: bili },
      xiaohongshu: { run: xhs },
    }),
  );
  const first = fetch(`${url}/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body({ query: 'Demo', limit: 20 })),
  });
  await vi.waitFor(() => expect(bili).toHaveBeenCalledTimes(1));
  const second = await fetch(`${url}/health`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body({ platform: 'xiaohongshu' })),
  });
  expect(await second.json()).toMatchObject({ ok: false, errorCode: 'busy' });
  expect(xhs).not.toHaveBeenCalled();
  release(JSON.stringify(rows));
  expect((await (await first).json()).ok).toBe(true);
});
it('application rejects replayed/cross-platform envelopes and collector project/platform escalation', async () => {
  const config: BrowserCollectorConfig = {
    id: 'local',
    name: 'Local',
    url: 'https://collector.invalid',
    token,
    platforms: ['bilibili'],
    projectIds: ['1'],
  };
  const request = { projectId: '1', requestId: randomUUID(), query: 'Demo' };
  for (const wrong of [
    { platform: 'xiaohongshu' },
    { requestId: randomUUID() },
    { projectId: '2' },
    { kind: 'video' },
  ]) {
    const adapter = new HttpBilibiliAdapter({
      fetchCollector: vi.fn(async () =>
        Response.json({
          ...body(),
          ...request,
          ok: true,
          kind: 'search',
          items: [],
          ...wrong,
        }),
      ),
    });
    await expect(adapter.search(config, request)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  }
  const fetchCollector = vi.fn();
  const adapter = new HttpBilibiliAdapter({ fetchCollector });
  await expect(
    adapter.search(config, { ...request, projectId: '2' }),
  ).rejects.toMatchObject({ code: 'not_connected' });
  await expect(
    adapter.search({ ...config, platforms: ['xiaohongshu'] }, request),
  ).rejects.toMatchObject({ code: 'not_connected' });
  expect(fetchCollector).not.toHaveBeenCalled();
});

// Exercise the real execFile runner with our own synthetic executable. No
// OpenCLI package, browser connection, account or external platform is used.
async function syntheticCli(ignoreTerm: boolean, overflow = false) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bili-process-test-'));
  const pidFile = path.join(directory, 'pid');
  const termFile = path.join(directory, 'terminated');
  const executable = path.join(directory, 'opencli');
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs = require('node:fs');\nprocess.on('SIGTERM', () => {fs.writeFileSync(${JSON.stringify(termFile)}, 'yes'); ${ignoreTerm ? '' : 'setTimeout(() => process.exit(0), 600);'}});\nfs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\n${overflow ? "process.stdout.write('x'.repeat(1024 * 1024 + 1));" : ''}\nsetInterval(() => {}, 100);\n`,
  );
  await chmod(executable, 0o700);
  const originalPath = process.env.PATH;
  process.env.PATH = `${directory}${path.delimiter}${originalPath || ''}`;
  let pid: number | undefined;
  const waitForFile = async (file: string) => {
    const deadline = Date.now() + 3000;
    while (!existsSync(file)) {
      if (Date.now() > deadline)
        throw new Error('Synthetic process did not reach expected state');
      await delay(10);
    }
  };
  return {
    async ready() {
      await waitForFile(pidFile);
      pid = Number(await readFile(pidFile, 'utf8'));
    },
    async terminating() {
      await waitForFile(termFile);
    },
    alive() {
      try {
        process.kill(pid!, 0);
        return true;
      } catch {
        return false;
      }
    },
    async cleanup() {
      process.env.PATH = originalPath;
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* Already reaped. */
        }
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}
it('holds the shared cross-platform busy slot until the real cancelled CLI closes', async () => {
  const cli = await syntheticCli(false);
  const controller = new AbortController();
  try {
    const url = await listen(
      createReadOnlyCollector({
        token,
        platforms: {
          bilibili: createBilibiliHandlers(),
          xiaohongshu: { health: async () => undefined },
        },
      }),
    );
    const pending = fetch(`${url}/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body({ query: 'synthetic', limit: 20 })),
      signal: controller.signal,
    }).catch((error) => error);
    await cli.ready();
    controller.abort();
    await pending;
    await cli.terminating();
    expect(cli.alive()).toBe(true);
    const during = await fetch(`${url}/health`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body({ platform: 'xiaohongshu' })),
    });
    expect(during.status).toBe(200);
    expect(await during.json()).toMatchObject({ ok: false, errorCode: 'busy' });
    const deadline = Date.now() + 3000;
    while (cli.alive()) {
      if (Date.now() > deadline)
        throw new Error('Cancelled CLI was not reaped');
      await delay(10);
    }
    const after = await fetch(`${url}/health`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body({ platform: 'xiaohongshu' })),
    });
    expect(after.status).toBe(200);
  } finally {
    controller.abort();
    await cli.cleanup();
  }
});
it('escalates cancellation to SIGKILL for a real CLI ignoring SIGTERM before settling', async () => {
  const cli = await syntheticCli(true);
  const controller = new AbortController();
  try {
    const pending = createBilibiliHandlers()
      .search({ query: 'synthetic', limit: 20 }, controller.signal)
      .catch((error) => error);
    await cli.ready();
    const at = Date.now();
    controller.abort();
    await cli.terminating();
    expect(cli.alive()).toBe(true);
    const error = await pending;
    expect(error.code).toBe('cancelled');
    expect(cli.alive()).toBe(false);
    expect(Date.now() - at).toBeGreaterThanOrEqual(900);
    expect(Date.now() - at).toBeLessThan(5000);
  } finally {
    controller.abort();
    await cli.cleanup();
  }
});

it('missing executables and an already-cancelled request terminate without leaking a process', async () => {
  const original = process.env.PATH;
  process.env.PATH = '/synthetic-missing-opencli-directory';
  try {
    await expect(
      createBilibiliHandlers().health(new AbortController().signal),
    ).rejects.toMatchObject({ code: 'tool_missing' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      createBilibiliHandlers().health(controller.signal),
    ).rejects.toMatchObject({ code: 'cancelled' });
  } finally {
    process.env.PATH = original;
  }
});
it('the real deadline escalates an uncooperative CLI and reports timeout, not cancellation', async () => {
  const cli = await syntheticCli(true);
  const controller = new AbortController();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const pending = createBilibiliHandlers()
      .search({ query: 'synthetic', limit: 20 }, controller.signal)
      .catch((error) => error);
    await cli.ready();
    await vi.advanceTimersByTimeAsync(75000);
    await cli.terminating();
    expect(cli.alive()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await pending;
    expect(error.code).toBe('timeout');
    expect(cli.alive()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    await cli.cleanup();
  }
});

it('kills and reaps a real oversized-output CLI without waiting for cooperative SIGTERM', async () => {
  const cli = await syntheticCli(true, true);
  try {
    const pending = createBilibiliHandlers()
      .search({ query: 'synthetic', limit: 20 }, new AbortController().signal)
      .catch((error) => error);
    await cli.ready();
    const error = await pending;
    expect(error.code).toBe('invalid_response');
    expect(cli.alive()).toBe(false);
  } finally {
    await cli.cleanup();
  }
});
