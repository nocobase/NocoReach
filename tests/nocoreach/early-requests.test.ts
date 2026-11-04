import { describe, expect, it, vi } from 'vitest';
import { EarlyRequests } from '../../client/pages/strategy/early-requests';

const cacheWith = (revisions: Record<string, number> = {}) =>
  ({ revision: (key: string) => revisions[key] ?? 0 }) as never;

describe('EarlyRequests', () => {
  it('hands a started request to the first read of its key only', async () => {
    const cache = cacheWith();
    const early = new EarlyRequests();
    const started = vi.fn().mockResolvedValue('early');
    const later = vi.fn().mockResolvedValue('later');
    early.start(cache, 'k', started);
    await expect(early.take(cache, 'k', later)).resolves.toBe('early');
    await expect(early.take(cache, 'k', later)).resolves.toBe('later');
    expect(started).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('fetches again after the key was invalidated or in another cache', async () => {
    const revisions: Record<string, number> = {};
    const cache = cacheWith(revisions);
    const early = new EarlyRequests();
    early.start(cache, 'k', () => Promise.resolve('before'));
    revisions.k = 1;
    await expect(
      early.take(cache, 'k', () => Promise.resolve('after')),
    ).resolves.toBe('after');
    early.start(cache, 'j', () => Promise.resolve('first session'));
    await expect(
      early.take(cacheWith(), 'j', () => Promise.resolve('second session')),
    ).resolves.toBe('second session');
  });

  it('does not report a started request that nobody reads as unhandled', async () => {
    const early = new EarlyRequests();
    early.start(cacheWith(), 'k', () => Promise.reject(new Error('failed')));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
