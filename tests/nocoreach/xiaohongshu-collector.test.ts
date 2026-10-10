// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createCollector,
  createXiaohongshuHandlers,
  failureCode,
  searchArguments,
} from '../../collectors/xiaohongshu.mjs';
import { HttpXiaohongshuAdapter } from '../../server/nocoreach/xiaohongshu-adapter';
import { createReadOnlyCollector } from '../../collectors/read-only-browser.mjs';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network';
import type { ProxyProfiles } from '../../server/nocoreach/proxy-profiles';
const token = 'synthetic-collector-test-token-no-real-account';
const servers: Server[] = [];
const networks: OutboundNetwork[] = [];
const rows = [
  {
    title: 'Test note',
    url: 'https://www.xiaohongshu.com/explore/69a123456789abcdef012345',
    likes: '35',
    published_at: '2026-03-01',
    author: 'PRIVATE AUTHOR',
    access_token: 'PRIVATE TOKEN',
  },
];
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
function body() {
  return {
    protocolVersion: 1,
    platform: 'xiaohongshu',
    projectId: '1',
    requestId: randomUUID(),
    query: 'NocoBase',
    limit: 20,
  };
}
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};
afterEach(async () => {
  await Promise.all(networks.splice(0).map((network) => network.close()));
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});
it('requires a strong explicitly supplied token and exposes no cookie, eval, or write tools', async () => {
  expect(() => createCollector({ token: '' })).toThrow();
  const run = vi.fn(async () => '1.0.0');
  const url = await listen(createCollector({ token, run }));
  expect(
    (await fetch(url + '/health', { method: 'POST', body: '{}' })).status,
  ).toBe(401);
  expect(
    (
      await fetch(url + '/health', {
        method: 'POST',
        headers: { ...headers, Origin: 'https://evil.example' },
        body: '{}',
      })
    ).status,
  ).toBe(401);
  for (const action of ['eval', 'publish', 'cookies', 'mcp'])
    expect(
      (await fetch(url + '/' + action, { method: 'POST', headers, body: '{}' }))
        .status,
    ).toBe(404);
  expect(run).not.toHaveBeenCalled();
});
it('end-to-end HTTP transport confirms only tool installation, then strips private data from search', async () => {
  const run = vi.fn(async (args: string[]) =>
    args[0] === '--version' ? 'opencli 1.0.0' : JSON.stringify(rows),
  );
  const url = await listen(createCollector({ token, run, profile: 'work' }));
  const network = new OutboundNetwork({
    resolve: () => {
      throw new Error('local browser bridge must not use project public proxy');
    },
  } as unknown as ProxyProfiles);
  networks.push(network);
  const adapter = new HttpXiaohongshuAdapter(network);
  const config = {
    id: 'local',
    name: 'Test collector',
    platforms: ['xiaohongshu'] as ('xiaohongshu' | 'bilibili')[],
    url,
    token,
  };
  const input = { projectId: '1', requestId: randomUUID(), query: 'NocoBase' };
  expect(await adapter.health(config, input)).toEqual({
    toolInstalled: true,
    browser: 'unchecked',
    login: 'unchecked',
  });
  const result = await adapter.search(config, input);
  expect(result.notes[0]).toMatchObject({ likes: 35, publishedAt: null });
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(run.mock.calls[1][0]).toEqual([
    '--profile',
    'work',
    'xiaohongshu',
    'search',
    'NocoBase',
    '--limit',
    '20',
    '--format',
    'json',
  ]);
});
it('passes user text as one fixed argument and rejects leading option injection', () => {
  expect(searchArguments('test; $(whoami)')).toEqual([
    'xiaohongshu',
    'search',
    'test; $(whoami)',
    '--limit',
    '20',
    '--format',
    'json',
  ]);
  for (const query of ['--help', 'x', 'x\nY', 'x'.repeat(61)])
    expect(() => searchArguments(query)).toThrow();
});
it('rejects wrong bodies and cannot let a client select another executable/profile/command', async () => {
  const run = vi.fn(async () => JSON.stringify(rows));
  const url = await listen(createCollector({ token, run }));
  for (const changes of [
    { command: 'publish' },
    { profile: 'private' },
    { limit: 100 },
    { query: '--help' },
    { projectId: '0' },
    { requestId: 'invalid' },
  ]) {
    expect(
      (
        await fetch(url + '/search', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body(), ...changes }),
        })
      ).status,
    ).toBe(400);
  }
  expect(
    (
      await fetch(url + '/search', {
        method: 'POST',
        headers,
        body: 'x'.repeat(5000),
      })
    ).status,
  ).toBe(413);
  expect(run).not.toHaveBeenCalled();
});
it('classifies login, challenge, browser, timeout and no-results without leaking stderr', async () => {
  for (const [error, code] of [
    [{ code: 'ENOENT' }, 'tool_missing'],
    [
      { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', killed: true },
      'invalid_response',
    ],
    [{ code: 77 }, 'login_required'],
    [{ code: 77, stderr: 'SECURITY_BLOCK secret' }, 'security_block'],
    [{ code: 69 }, 'browser_unavailable'],
    [{ code: 75 }, 'timeout'],
    [{ code: 66 }, 'no_results'],
    [{ stderr: 'secret' }, 'invalid_response'],
  ] as const)
    expect(failureCode(error)).toBe(code);
  const url = await listen(
    createCollector({
      token,
      run: async () => {
        throw Object.assign(new Error('secret'), {
          code: 77,
          stderr: 'secret-cookie',
        });
      },
    }),
  );
  const response = await fetch(url + '/search', {
    method: 'POST',
    headers,
    body: JSON.stringify(body()),
  });
  const value = await response.json();
  expect(value).toMatchObject({ ok: false, errorCode: 'login_required' });
  expect(JSON.stringify(value)).not.toContain('secret');
});
it('never claims an empty CLI array verifies the browser or zero global mentions', async () => {
  const url = await listen(createCollector({ token, run: async () => '[]' }));
  expect(
    await (
      await fetch(url + '/search', {
        method: 'POST',
        headers,
        body: JSON.stringify(body()),
      })
    ).json(),
  ).toMatchObject({ ok: false, errorCode: 'no_results' });
});
it('serializes browser use across projects and aborts the child when the caller disconnects', async () => {
  let childSignal: AbortSignal | undefined;
  const run = vi.fn(
    (_args: string[], signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        childSignal = signal;
        signal.addEventListener(
          'abort',
          () =>
            reject(
              Object.assign(new Error('cancelled'), { name: 'AbortError' }),
            ),
          { once: true },
        );
      }),
  );
  const url = await listen(createCollector({ token, run }));
  const controller = new AbortController();
  const pending = fetch(url + '/search', {
    method: 'POST',
    headers,
    body: JSON.stringify(body()),
    signal: controller.signal,
  });
  const settled = pending.catch((error: unknown) => error);
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  const other = await fetch(url + '/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body(), projectId: '2' }),
  });
  expect(await other.json()).toMatchObject({ ok: false, errorCode: 'busy' });
  controller.abort();
  await settled;
  await vi.waitFor(() => expect(childSignal?.aborted).toBe(true));
});
it('rejects redirects rather than forwarding bearer authentication', async () => {
  let reached = 0;
  const target = await listen(
    createServer((_req, res) => {
      reached++;
      res.end('{}');
    }),
  );
  const url = await listen(
    createServer((_req, res) => {
      res.writeHead(302, { Location: target });
      res.end();
    }),
  );
  const network = new OutboundNetwork({
    resolve: () => undefined,
  } as unknown as ProxyProfiles);
  networks.push(network);
  const adapter = new HttpXiaohongshuAdapter(network);
  await expect(
    adapter.health(
      { id: 'x', name: 'x', platforms: ['xiaohongshu'], token, url },
      { projectId: '1', requestId: randomUUID() },
    ),
  ).rejects.toMatchObject({ code: 'collector_unreachable' });
  expect(reached).toBe(0);
});

it('requires explicit platform selection and never falls back to a different registered platform', async () => {
  const xhs = vi.fn(async () => rows);
  const bili = vi.fn(async () => [{ bvid: 'BV1234567890' }]);
  const url = await listen(
    createReadOnlyCollector({
      token,
      platforms: {
        xiaohongshu: { search: xhs },
        bilibili: { search: bili },
      },
    }),
  );
  for (const platform of [undefined, 'youtube']) {
    expect(
      (
        await fetch(url + '/search', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body(), platform }),
        })
      ).status,
    ).toBe(400);
  }
  const response = await fetch(url + '/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body(), platform: 'bilibili', query: '-x' }),
  });
  expect(await response.json()).toMatchObject({
    ok: true,
    platform: 'bilibili',
  });
  expect(bili).toHaveBeenCalledOnce();
  expect(xhs).not.toHaveBeenCalled();
  const onlyXhs = await listen(
    createCollector({ token, run: async () => JSON.stringify(rows) }),
  );
  expect(
    (
      await fetch(onlyXhs + '/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body(), platform: 'bilibili' }),
      })
    ).status,
  ).toBe(404);
});

// Only the local test process sees this owned synthetic executable. Never
// installs OpenCLI, opens a browser or connects to an external platform.
async function syntheticCli(ignoreTerm: boolean, overflow = false) {
  const directory = await mkdtemp(path.join(tmpdir(), 'xhs-process-test-'));
  const pidFile = path.join(directory, 'pid');
  const termFile = path.join(directory, 'term');
  const executable = path.join(directory, 'opencli');
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs = require('node:fs');\nprocess.on('SIGTERM', () => {fs.writeFileSync(${JSON.stringify(termFile)}, 'yes'); ${ignoreTerm ? '' : 'setTimeout(() => process.exit(0), 600);'}});\nfs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\n${overflow ? "process.stdout.write('x'.repeat(2 * 1024 * 1024));" : ''}\nsetInterval(() => {}, 100);\n`,
  );
  await chmod(executable, 0o700);
  const originalPath = process.env.PATH;
  process.env.PATH = `${directory}${path.delimiter}${originalPath || ''}`;
  let pid: number | undefined;
  const waitFile = async (file: string) => {
    const until = Date.now() + 5000;
    while (!existsSync(file)) {
      if (Date.now() > until)
        throw new Error('Synthetic process did not reach expected state');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  return {
    async ready() {
      await waitFile(pidFile);
      pid = Number(await readFile(pidFile, 'utf8'));
      if (!Number.isInteger(pid) || pid < 1)
        throw new Error('Invalid synthetic PID');
    },
    async terminating() {
      await waitFile(termFile);
    },
    alive() {
      if (!pid) return false;
      try {
        process.kill(pid, 0);
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
it('keeps the cross-platform host busy until a cancelled real CLI has actually closed', async () => {
  const cli = await syntheticCli(false);
  const controller = new AbortController();
  const otherHealth = vi.fn(async () => undefined);
  try {
    const url = await listen(
      createReadOnlyCollector({
        token,
        platforms: {
          xiaohongshu: createXiaohongshuHandlers(),
          bilibili: { health: otherHealth },
        },
      }),
    );
    const pending = fetch(url + '/search', {
      method: 'POST',
      headers,
      body: JSON.stringify(body()),
      signal: controller.signal,
    }).catch((error) => error);
    await cli.ready();
    controller.abort();
    await pending;
    await cli.terminating();
    expect(cli.alive()).toBe(true);
    const healthBody = {
      protocolVersion: 1,
      platform: 'bilibili',
      projectId: '2',
      requestId: randomUUID(),
    };
    const during = await fetch(url + '/health', {
      method: 'POST',
      headers,
      body: JSON.stringify(healthBody),
    });
    expect(await during.json()).toMatchObject({ ok: false, errorCode: 'busy' });
    expect(otherHealth).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(cli.alive()).toBe(false), { timeout: 5000 });
    const after = await fetch(url + '/health', {
      method: 'POST',
      headers,
      body: JSON.stringify(healthBody),
    });
    expect(await after.json()).toMatchObject({ ok: true, toolInstalled: true });
    expect(otherHealth).toHaveBeenCalledOnce();
  } finally {
    controller.abort();
    await cli.cleanup();
  }
});
it('escalates an uncooperative cancelled CLI to SIGKILL and settles only after close', async () => {
  const cli = await syntheticCli(true);
  const controller = new AbortController();
  try {
    const pending = createXiaohongshuHandlers()
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
it('bounds excess output even when the real CLI ignores SIGTERM', async () => {
  const cli = await syntheticCli(true, true);
  const controller = new AbortController();
  try {
    const pending = createXiaohongshuHandlers()
      .search({ query: 'synthetic', limit: 20 }, controller.signal)
      .catch((error) => error);
    await cli.ready();
    const error = await pending;
    expect(error.code).toBe('invalid_response');
    expect(cli.alive()).toBe(false);
  } finally {
    controller.abort();
    await cli.cleanup();
  }
});
