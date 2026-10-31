// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  allowAllWrites,
  importOnce,
  poll,
} from '../../scripts/ci/prepare-preview.mjs';

type Answer = { status?: number; data?: unknown };
// Answers each path from its queue of answers, repeating the last one.
const fakeClient = (routes: Record<string, Answer[]>) => {
  const calls: { path: string; method?: string; body?: unknown }[] = [];
  return {
    calls,
    request: vi.fn(
      async (
        path: string,
        options: { method?: string; body?: unknown } = {},
      ) => {
        calls.push({ path, ...options });
        const queue = routes[path];
        if (!queue) throw new Error(`Unexpected request ${path}`);
        const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
        const status = answer.status ?? 200;
        return {
          status,
          ok: status < 400,
          json: status < 400 ? { data: answer.data } : null,
        };
      },
    ),
  };
};
const options = { wait: async () => {}, now: () => 0, timeout: 1 };

describe('prepare-preview', () => {
  it('retries while the App is starting', async () => {
    const client = fakeClient({
      '/healthz': [{ status: 503 }, { data: { ok: true } }],
    });
    await expect(
      poll(client, '/healthz', (h: { ok: boolean }) => h.ok === true, options),
    ).resolves.toBe(true);
    expect(client.calls).toHaveLength(2);
  });

  it('gives up with the last answer at the deadline', async () => {
    const client = fakeClient({ '/healthz': [{ status: 503 }] });
    const clock = vi.fn().mockReturnValueOnce(0).mockReturnValue(10);
    await expect(
      poll(client, '/healthz', () => true, { ...options, now: clock }),
    ).rejects.toThrow('last answer: 503');
  });

  it('imports once and waits for the import', async () => {
    const client = fakeClient({
      '/demoMode/data': [
        { data: { present: false, importing: null, operation: null } },
        { data: { present: false, importing: { percent: 40 } } },
        { data: { present: true } },
      ],
      '/demoMode/data/import': [{ data: {} }],
    });
    await expect(importOnce(client, 'zh-CN', options)).resolves.toEqual({
      imported: true,
    });
    expect(
      client.calls.filter((c) => c.path === '/demoMode/data/import'),
    ).toEqual([
      {
        path: '/demoMode/data/import',
        method: 'POST',
        body: { language: 'zh-CN' },
      },
    ]);
  });

  it('keeps the data of an earlier deployment', async () => {
    const client = fakeClient({
      '/demoMode/data': [{ data: { present: true } }],
    });
    await expect(importOnce(client, 'zh-CN', options)).resolves.toEqual({
      imported: false,
    });
    expect(client.calls).toHaveLength(1);
  });

  it('reports why an import stopped instead of starting it again', async () => {
    const idle = { present: false, importing: null, operation: null };
    const client = fakeClient({
      '/demoMode/data': [
        { data: idle },
        { data: { ...idle, failure: { code: 'BOOM' } } },
      ],
      '/demoMode/data/import': [{ data: {} }],
    });
    await expect(importOnce(client, 'zh-CN', options)).rejects.toThrow('BOOM');
  });

  const collections = { data: [{ name: 'b' }, { name: 'a' }, { name: 'a' }] };

  it('sets the variable and restarts when a collection is missing', async () => {
    const client = fakeClient({
      '/demoMode/configuration/collections': [collections],
      '/demoMode/configuration': [
        { data: { fixedCollections: ['session'] } },
        { status: 503 },
        { data: { fixedCollections: ['session'] } },
        { data: { fixedCollections: ['a', 'b', 'session'] } },
      ],
    });
    const cli = vi.fn(async () => ({}));
    await expect(
      allowAllWrites({ client, appId: 'nocoreach-pr-1', cli, options }),
    ).resolves.toEqual({ collections: 2, restarted: true });
    expect(cli.mock.calls.map(([args]) => args)).toEqual([
      [
        'app',
        'env',
        'set',
        'nocoreach-pr-1',
        'NOCOBASE_DEMO_WRITABLE_COLLECTIONS',
        'a,b',
        '--json',
      ],
      ['app', 'restart', 'nocoreach-pr-1', '--json'],
    ]);
  });

  it('leaves the App running when every collection is writable', async () => {
    const client = fakeClient({
      '/demoMode/configuration/collections': [collections],
      '/demoMode/configuration': [{ data: { fixedCollections: ['a', 'b'] } }],
    });
    const cli = vi.fn(async () => ({}));
    await expect(
      allowAllWrites({ client, appId: 'nocoreach-pr-1', cli, options }),
    ).resolves.toEqual({ collections: 2, restarted: false });
    expect(cli).not.toHaveBeenCalled();
  });
});
