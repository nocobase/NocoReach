// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { ConnectionStatusCache } from '../../server/nocoreach/connection-status-cache.js';

afterEach(() => vi.restoreAllMocks());
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('cold and stale concurrent reads share work, with ten-minute successful freshness', async () => {
  let now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const cache = new ConnectionStatusCache();
  const first = deferred<string>();
  const fetcher = vi.fn(() => first.promise);
  const cold = Array.from({ length: 20 }, () =>
    cache.read('1', 'identity:1', fetcher),
  );
  first.resolve('old');
  expect(await Promise.all(cold)).toEqual(Array(20).fill('old'));
  expect(fetcher).toHaveBeenCalledTimes(1);
  now = 599_000;
  expect(await cache.read('1', 'identity:1', fetcher)).toBe('old');
  expect(fetcher).toHaveBeenCalledTimes(1);
  now = 600_001;
  const next = deferred<string>();
  fetcher.mockImplementation(() => next.promise);
  expect(
    await Promise.all(
      Array.from({ length: 20 }, () => cache.read('1', 'identity:1', fetcher)),
    ),
  ).toEqual(Array(20).fill('old'));
  expect(fetcher).toHaveBeenCalledTimes(2);
  next.resolve('new');
  await next.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(await cache.read('1', 'identity:1', fetcher)).toBe('new');
});

test('refresh failures retain the last successful value and retry without renewing its age', async () => {
  let now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const cache = new ConnectionStatusCache();
  const fetcher = vi.fn(async () => 'old');
  expect(await cache.read('1', 'one', fetcher)).toBe('old');
  now = 600_001;
  const failed = deferred<string>();
  fetcher.mockImplementation(() => failed.promise);
  expect(await cache.read('1', 'one', fetcher)).toBe('old');
  failed.reject(new Error('unavailable'));
  await failed.promise.catch(() => {});
  await Promise.resolve();
  expect(await cache.read('1', 'one', fetcher)).toBe('old');
  expect(fetcher).toHaveBeenCalledTimes(2);
  now += 30_001;
  fetcher.mockResolvedValue('recovered');
  expect(await cache.read('1', 'one', fetcher)).toBe('old');
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(await cache.read('1', 'one', fetcher)).toBe('recovered');
  const missing = vi.fn(async () => {
    throw new Error('failed first read');
  });
  expect(await cache.read('1', 'missing', missing)).toBeNull();
  expect(await cache.read('1', 'missing', missing)).toBeNull();
  expect(missing).toHaveBeenCalledTimes(1);
});

test('project invalidation fences old pending work and leaves other projects intact', async () => {
  const cache = new ConnectionStatusCache();
  const old = deferred<string>();
  const request = cache.read('1', 'session:1', () => old.promise);
  await cache.read('2', 'session:2', async () => 'other');
  cache.invalidate('1');
  expect(await cache.read('1', 'session:1', async () => 'updated')).toBe(
    'updated',
  );
  old.resolve('outdated');
  await request;
  const unexpected = vi.fn(async () => 'unexpected');
  expect(await cache.read('1', 'session:1', unexpected)).toBe('updated');
  expect(await cache.read('2', 'session:2', unexpected)).toBe('other');
  expect(unexpected).not.toHaveBeenCalled();
});
